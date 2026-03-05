export interface SmsConfig {
  provider: 'aliyun' | 'tencent' | 'qiniu';
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
}

class SmsService {
  private config: SmsConfig | null = null;

  init(config: SmsConfig) {
    this.config = config;
  }

  async sendVerificationCode(phone: string, code: string): Promise<boolean> {
    if (!this.config) {
      console.warn('短信服务未配置，使用模拟模式');
      return true;
    }

    try {
      // 根据不同的服务商调用不同的API
      switch (this.config.provider) {
        case 'aliyun':
          return await this.sendByAliyun(phone, code);
        case 'tencent':
          return await this.sendByTencent(phone, code);
        default:
          return true;
      }
    } catch (error) {
      console.error('短信发送失败:', error);
      return false;
    }
  }

  private async sendByAliyun(phone: string, code: string): Promise<boolean> {
    // 阿里云短信接口调用
    const response = await fetch('/api/sms/aliyun', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code })
    });
    const result = await response.json();
    return result.success;
  }

  private async sendByTencent(phone: string, code: string): Promise<boolean> {
    // 腾讯云短信接口调用
    const response = await fetch('/api/sms/tencent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code })
    });
    const result = await response.json();
    return result.success;
  }
}

export const smsService = new SmsService();
