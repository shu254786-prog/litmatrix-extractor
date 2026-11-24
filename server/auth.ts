import * as crypto from 'node:crypto';
import { db } from './db.js';

export interface UserProfile {
  userId: string;
  openId: string;
  syncCode: string;
  nickName: string;
  avatarUrl: string;
  isGuest: boolean;
  loginMode: 'wechat_official' | 'dev_local' | 'guest' | 'web_workspace';
  createdAt: number;
}

const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() || 'litmatrix_local_session_secret_2026';

function signToken(userId: string): string {
  const nonce = crypto.randomBytes(12).toString('hex');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${userId}.${nonce}`)
    .digest('hex')
    .slice(0, 24);
  return `lm_${nonce}_${sig}`;
}

function generateUniqueSyncCode(): string {
  const checkStmt = db.prepare('SELECT 1 FROM users WHERE sync_code = ?');
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const num = crypto.randomInt(100000, 999999);
    const code = String(num);
    if (!checkStmt.get(code)) {
      return code;
    }
  }
  return String(Date.now()).slice(-6);
}

function rowToUser(row: Record<string, unknown>): UserProfile {
  return {
    userId: String(row.user_id),
    openId: String(row.open_id),
    syncCode: String(row.sync_code),
    nickName: String(row.nick_name),
    avatarUrl: String(row.avatar_url || ''),
    isGuest: Boolean(row.is_guest),
    loginMode: row.login_mode as UserProfile['loginMode'],
    createdAt: Number(row.created_at),
  };
}

function createSessionTokenForUser(userId: string): string {
  const token = signToken(userId);
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    Date.now()
  );
  return token;
}

export function getSessionByToken(token?: string): UserProfile | undefined {
  if (!token) return undefined;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.user_id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return rowToUser(row);
}

export function createOrRestoreWebSession(existingToken?: string): {
  token: string;
  user: UserProfile;
} {
  const existing = getSessionByToken(existingToken);
  if (existing && existingToken) {
    return { token: existingToken, user: existing };
  }

  const userId = `web_${crypto.randomBytes(6).toString('hex')}`;
  const syncCode = generateUniqueSyncCode();
  const now = Date.now();

  db.prepare(
    `INSERT INTO users (user_id, open_id, sync_code, nick_name, avatar_url, is_guest, login_mode, created_at)
     VALUES (?, ?, ?, ?, '', 0, 'web_workspace', ?)`
  ).run(userId, userId, syncCode, '桌面端工作台', now);

  const token = createSessionTokenForUser(userId);
  const user = getSessionByToken(token)!;
  return { token, user };
}

export async function loginWithWeChatCode(params: {
  code?: string;
  nickName?: string;
  avatarUrl?: string;
  isGuest?: boolean;
}): Promise<{ token: string; user: UserProfile }> {
  const { code, nickName, avatarUrl, isGuest } = params;

  if (isGuest) {
    const userId = `guest_${crypto.randomBytes(6).toString('hex')}`;
    const syncCode = generateUniqueSyncCode();
    const now = Date.now();
    db.prepare(
      `INSERT INTO users (user_id, open_id, sync_code, nick_name, avatar_url, is_guest, login_mode, created_at)
       VALUES (?, ?, ?, '访客研究员', '', 1, 'guest', ?)`
    ).run(userId, userId, syncCode, now);
    const token = createSessionTokenForUser(userId);
    return { token, user: getSessionByToken(token)! };
  }

  const appId = process.env.WECHAT_APPID?.trim();
  const appSecret = process.env.WECHAT_APPSECRET?.trim();

  let openId = '';
  let loginMode: UserProfile['loginMode'] = 'dev_local';

  if (appId && appSecret && code) {
    try {
      const resp = await fetch(
        `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(
          appId
        )}&secret=${encodeURIComponent(appSecret)}&js_code=${encodeURIComponent(
          code
        )}&grant_type=authorization_code`
      );
      const data = (await resp.json()) as { openid?: string };
      if (data.openid) {
        openId = data.openid;
        loginMode = 'wechat_official';
      }
    } catch {
      // Fallback to deterministic local openId
    }
  }

  if (!openId) {
    // In local dev without WECHAT_APPSECRET, keep a stable local WeChat developer identity
    openId = 'wx_dev_researcher_default';
    loginMode = 'dev_local';
  }

  const existingRow = db
    .prepare('SELECT * FROM users WHERE user_id = ?')
    .get(openId) as Record<string, unknown> | undefined;

  if (existingRow) {
    const nextNick = nickName?.trim() || String(existingRow.nick_name);
    const nextAvatar = avatarUrl?.trim() || String(existingRow.avatar_url || '');
    db.prepare(
      'UPDATE users SET nick_name = ?, avatar_url = ?, is_guest = 0, login_mode = ? WHERE user_id = ?'
    ).run(nextNick, nextAvatar, loginMode, openId);
  } else {
    const syncCode = generateUniqueSyncCode();
    db.prepare(
      `INSERT INTO users (user_id, open_id, sync_code, nick_name, avatar_url, is_guest, login_mode, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      openId,
      openId,
      syncCode,
      nickName?.trim() || '微信科研用户',
      avatarUrl?.trim() || '',
      loginMode,
      Date.now()
    );
  }

  const token = createSessionTokenForUser(openId);
  return { token, user: getSessionByToken(token)! };
}

export function updateSessionProfile(
  token: string,
  updates: { nickName?: string; avatarUrl?: string }
): UserProfile | undefined {
  const session = getSessionByToken(token);
  if (!session) return undefined;

  const nextNick = updates.nickName?.trim() || session.nickName;
  const nextAvatar =
    updates.avatarUrl !== undefined ? updates.avatarUrl.trim() : session.avatarUrl;

  db.prepare('UPDATE users SET nick_name = ?, avatar_url = ? WHERE user_id = ?').run(
    nextNick,
    nextAvatar,
    session.userId
  );
  return getSessionByToken(token);
}

export function bindSessionBySyncCode(
  currentToken: string | undefined,
  rawSyncCode: string
): { token: string; user: UserProfile; mergedJobs: number } {
  const cleanCode = rawSyncCode.replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    throw new Error('请输入 6 位数字跨端互通码');
  }

  const targetRow = db
    .prepare('SELECT * FROM users WHERE sync_code = ?')
    .get(cleanCode) as Record<string, unknown> | undefined;

  if (!targetRow) {
    throw new Error('未找到该互通码对应的工作区，请核对 6 位数字');
  }

  const targetUser = rowToUser(targetRow);
  const currentSession = getSessionByToken(currentToken);

  let mergedJobs = 0;
  if (currentSession && currentSession.userId !== targetUser.userId) {
    const info = db
      .prepare('UPDATE jobs SET owner_id = ? WHERE owner_id = ?')
      .run(targetUser.userId, currentSession.userId);
    mergedJobs = Number(info.changes || 0);
  }

  let finalToken = currentToken || '';
  if (finalToken && currentSession) {
    db.prepare('UPDATE sessions SET user_id = ? WHERE token = ?').run(
      targetUser.userId,
      finalToken
    );
  } else {
    finalToken = createSessionTokenForUser(targetUser.userId);
  }

  return {
    token: finalToken,
    user: getSessionByToken(finalToken)!,
    mergedJobs,
  };
}
