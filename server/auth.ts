import * as crypto from 'node:crypto';

export interface WeChatUserSession {
  userId: string;
  openId: string;
  nickName: string;
  avatarUrl: string;
  isGuest: boolean;
  loginMode: 'wechat_official' | 'dev_local' | 'guest';
  createdAt: number;
}

const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() || 'litmatrix_local_session_secret_2026';

const sessions = new Map<string, WeChatUserSession>();

function signToken(userId: string): string {
  const nonce = crypto.randomBytes(12).toString('hex');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${userId}.${nonce}`)
    .digest('hex')
    .slice(0, 24);
  return `lm_${nonce}_${sig}`;
}

export async function loginWithWeChatCode(params: {
  code?: string;
  nickName?: string;
  avatarUrl?: string;
  isGuest?: boolean;
}): Promise<{ token: string; user: WeChatUserSession }> {
  const { code, nickName, avatarUrl, isGuest } = params;

  if (isGuest) {
    const userId = `guest_${crypto.randomBytes(6).toString('hex')}`;
    const user: WeChatUserSession = {
      userId,
      openId: userId,
      nickName: '访客研究员',
      avatarUrl: '',
      isGuest: true,
      loginMode: 'guest',
      createdAt: Date.now(),
    };
    const token = signToken(userId);
    sessions.set(token, user);
    return { token, user };
  }

  const appId = process.env.WECHAT_APPID?.trim();
  const appSecret = process.env.WECHAT_APPSECRET?.trim();

  let openId = '';
  let loginMode: WeChatUserSession['loginMode'] = 'dev_local';

  if (appId && appSecret && code) {
    try {
      const resp = await fetch(
        `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(
          appId
        )}&secret=${encodeURIComponent(appSecret)}&js_code=${encodeURIComponent(
          code
        )}&grant_type=authorization_code`
      );
      const data = (await resp.json()) as {
        openid?: string;
        errcode?: number;
        errmsg?: string;
      };
      if (data.openid) {
        openId = data.openid;
        loginMode = 'wechat_official';
      }
    } catch {
      // Fallback to deterministic local session if offline
    }
  }

  if (!openId) {
    const hash = crypto
      .createHash('sha256')
      .update(code || `local_${Date.now()}`)
      .digest('hex')
      .slice(0, 16);
    openId = `dev_openid_${hash}`;
    loginMode = 'dev_local';
  }

  const user: WeChatUserSession = {
    userId: openId,
    openId,
    nickName: nickName?.trim() || '微信科研用户',
    avatarUrl: avatarUrl?.trim() || '',
    isGuest: false,
    loginMode,
    createdAt: Date.now(),
  };

  const token = signToken(user.userId);
  sessions.set(token, user);
  return { token, user };
}

export function getSessionByToken(token?: string): WeChatUserSession | undefined {
  if (!token) return undefined;
  return sessions.get(token);
}

export function updateSessionProfile(
  token: string,
  updates: { nickName?: string; avatarUrl?: string }
): WeChatUserSession | undefined {
  const s = sessions.get(token);
  if (!s) return undefined;
  if (updates.nickName !== undefined) {
    s.nickName = updates.nickName.trim() || s.nickName;
  }
  if (updates.avatarUrl !== undefined) {
    s.avatarUrl = updates.avatarUrl.trim();
  }
  return s;
}
