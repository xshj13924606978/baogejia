export interface EnterpriseApplication {
  id: string;
  companyName: string;
  businessLicense: string;
  licenseImage: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  companyAddress: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  approvedAt?: string;
  rejectReason?: string;
}

// 模拟企业认证审核
class EnterpriseAuthService {
  private applications: EnterpriseApplication[] = [];

  // 提交企业认证
  async submitApplication(
    data: Partial<EnterpriseApplication>
  ): Promise<{ success: boolean; applicationId?: string; error?: string }> {
    try {
      // 验证营业执照
      if (!data.businessLicense || !data.licenseImage) {
        return { success: false, error: '请上传营业执照' };
      }

      // 创建申请
      const application: EnterpriseApplication = {
        id: 'ent-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        companyName: data.companyName || '',
        businessLicense: data.businessLicense,
        licenseImage: data.licenseImage,
        contactPerson: data.contactPerson || '',
        contactPhone: data.contactPhone || '',
        contactEmail: data.contactEmail || '',
        companyAddress: data.companyAddress || '',
        status: 'pending',
        submittedAt: new Date().toISOString(),
      };

      // 保存申请
      this.applications.push(application);

      // 模拟审核（实际应该由管理员审核）
      // 这里简化处理：自动审核通过
      setTimeout(() => {
        this.approveApplication(application.id);
      }, 5000);

      return { success: true, applicationId: application.id };
    } catch (error) {
      return { success: false, error: '提交失败' };
    }
  }

  // 审核通过
  private approveApplication(id: string) {
    const index = this.applications.findIndex((app) => app.id === id);
    if (index !== -1) {
      this.applications[index].status = 'approved';
      this.applications[index].approvedAt = new Date().toISOString();

      // 创建企业账号
      this.createEnterpriseAccount(this.applications[index]);
    }
  }

  // 创建企业账号
  private createEnterpriseAccount(application: EnterpriseApplication) {
    // 创建企业用户
    const enterpriseUser = {
      id: 'ent-user-' + Date.now(),
      email: application.contactEmail,
      name: application.contactPerson,
      role: 'enterprise',
      company: application.companyName,
      address: application.companyAddress,
      enterprise: application,
      createdAt: new Date().toISOString(),
    };

    // 保存到用户数据库
    const users = JSON.parse(localStorage.getItem('users_db') || '[]');
    users.push(enterpriseUser);
    localStorage.setItem('users_db', JSON.stringify(users));
  }

  // 获取申请状态
  async getApplicationStatus(
    applicationId: string
  ): Promise<{ status: string; application?: EnterpriseApplication }> {
    const application = this.applications.find((app) => app.id === applicationId);
    if (application) {
      return { status: application.status, application };
    }
    return { status: 'not_found' };
  }

  // 企业员工登录
  async employeeLogin(
    enterpriseId: string,
    employeeId: string,
    accessToken: string
  ): Promise<{ success: boolean; user?: any; error?: string }> {
    // 验证企业账号和员工凭证
    const users = JSON.parse(localStorage.getItem('users_db') || '[]');
    const enterpriseUser = users.find((u: any) => u.id === enterpriseId && u.role === 'enterprise');

    if (!enterpriseUser) {
      return { success: false, error: '企业不存在' };
    }

    // 验证员工（简化处理）
    if (accessToken === 'mock-token-' + employeeId) {
      return {
        success: true,
        user: {
          ...enterpriseUser,
          employeeId,
          role: 'enterprise_staff',
        },
      };
    }

    return { success: false, error: '验证失败' };
  }
}

export const enterpriseAuth = new EnterpriseAuthService();
