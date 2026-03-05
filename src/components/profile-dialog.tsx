"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUser } from "@/contexts/UserContext"
import { Camera, Mail, Phone, User as UserIcon, Loader2, Key, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Toaster } from "@/components/ui/toaster"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user, updateUser, uploadAvatar, bindEmail, bindPhone, sendPhoneCode, unbindEmail, changePassword, isLoading } = useUser()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = React.useState("profile")
  const [name, setName] = React.useState("")
  const [uploading, setUploading] = React.useState(false)
  
  // 邮箱绑定状态
  const [newEmail, setNewEmail] = React.useState("")
  const [emailPassword, setEmailPassword] = React.useState("")
  const [emailCode, setEmailCode] = React.useState("")
  const [showEmailCode, setShowEmailCode] = React.useState(false)
  const [sendingEmailCode, setSendingEmailCode] = React.useState(false)
  const [bindingEmail, setBindingEmail] = React.useState(false)
  const [unbindingEmail, setUnbindingEmail] = React.useState(false)
  
  // 手机绑定状态
  const [newPhone, setNewPhone] = React.useState("")
  const [phoneCode, setPhoneCode] = React.useState("")
  const [showPhoneCode, setShowPhoneCode] = React.useState(false)
  const [sendingPhoneCode, setSendingPhoneCode] = React.useState(false)
  const [bindingPhone, setBindingPhone] = React.useState(false)

  // 修改密码状态 - 使用三个独立的key来防止自动填充
  const [oldPassword, setOldPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [changingPassword, setChangingPassword] = React.useState(false)
  
  // 解绑确认对话框
  const [showUnbindConfirm, setShowUnbindConfirm] = React.useState(false)

  // 使用多个key来强制React重新渲染输入框
  const [emailFormKey, setEmailFormKey] = React.useState(Math.random().toString(36))
  const [passwordFormKey, setPasswordFormKey] = React.useState(Math.random().toString(36))

  // 当用户数据更新时，设置姓名
  React.useEffect(() => {
    console.log('[ProfileDialog] 用户数据更新:', user)
    if (user?.name) {
      setName(user.name)
    }
  }, [user])

  // 当标签页切换时，重置所有key和密码
  React.useEffect(() => {
    // 生成新的随机key
    setEmailFormKey(Math.random().toString(36))
    setPasswordFormKey(Math.random().toString(36))
    
    // 清空所有密码输入
    setEmailPassword("")
    setOldPassword("")
    setNewPassword("")
    setConfirmPassword("")
    
    // 重置验证码状态
    setEmailCode("")
    setShowEmailCode(false)
    setPhoneCode("")
    setShowPhoneCode(false)
  }, [activeTab])

  // 处理对话框关闭
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // 关闭前重置所有状态
      setActiveTab("profile")
      setNewEmail("")
      setEmailPassword("")
      setEmailCode("")
      setShowEmailCode(false)
      setNewPhone("")
      setPhoneCode("")
      setShowPhoneCode(false)
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
      
      setTimeout(() => {
        onOpenChange(false)
      }, 50)
    } else {
      onOpenChange(true)
    }
  }

  // 处理头像上传
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({
        title: "错误",
        description: "请上传图片文件",
        variant: "destructive",
      })
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "错误",
        description: "图片大小不能超过2MB",
        variant: "destructive",
      })
      return
    }

    try {
      setUploading(true)
      const formData = new FormData()
      formData.append('avatar', file)
      
      await uploadAvatar(formData)
      toast({
        title: "成功",
        description: "头像上传成功",
      })
    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "头像上传失败",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // 保存姓名
  const handleSaveName = async () => {
    if (!name.trim()) {
      toast({
        title: "错误",
        description: "姓名不能为空",
        variant: "destructive",
      })
      return
    }

    try {
      await updateUser({ name: name.trim() })
      toast({
        title: "成功",
        description: "姓名更新成功",
      })
    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "姓名更新失败",
        variant: "destructive",
      })
    }
  }

  // 发送邮箱验证码
  const handleSendEmailCode = async () => {
    if (!newEmail) {
      toast({
        title: "错误",
        description: "请输入邮箱",
        variant: "destructive",
      })
      return
    }

    if (!emailPassword) {
      toast({
        title: "错误",
        description: "请输入密码",
        variant: "destructive",
      })
      return
    }

    try {
      setSendingEmailCode(true)
      await bindEmail(newEmail, emailPassword, true)
      setShowEmailCode(true)
      toast({
        title: "成功",
        description: "验证码已发送到邮箱",
      })
    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "发送验证码失败",
        variant: "destructive",
      })
    } finally {
      setSendingEmailCode(false)
    }
  }

  // 绑定邮箱
  const handleBindEmail = async () => {
    if (!emailCode) {
      toast({
        title: "错误",
        description: "请输入验证码",
        variant: "destructive",
      })
      return
    }

    try {
      setBindingEmail(true)
      await bindEmail(newEmail, emailPassword, false, emailCode)
      toast({
        title: "成功",
        description: "邮箱绑定成功",
      })
      setNewEmail("")
      setEmailPassword("")
      setEmailCode("")
      setShowEmailCode(false)
    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "邮箱绑定失败",
        variant: "destructive",
      })
    } finally {
      setBindingEmail(false)
    }
  }

  // 解绑邮箱
  const handleUnbindEmail = async () => {
    try {
      setUnbindingEmail(true)
      const success = await unbindEmail()
      if (success) {
        toast({
          title: "成功",
          description: "邮箱解绑成功",
        })
      } else {
        toast({
          title: "错误",
          description: "解绑失败，请重试",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "解绑失败",
        variant: "destructive",
      })
    } finally {
      setUnbindingEmail(false)
      setShowUnbindConfirm(false)
    }
  }

  // 发送手机验证码
  const handleSendPhoneCode = async () => {
    if (!newPhone) {
      toast({
        title: "错误",
        description: "请输入手机号",
        variant: "destructive",
      })
      return
    }

    try {
      setSendingPhoneCode(true)
      await sendPhoneCode(newPhone)
      setShowPhoneCode(true)
      toast({
        title: "成功",
        description: "验证码已发送到手机",
      })
    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "发送验证码失败",
        variant: "destructive",
      })
    } finally {
      setSendingPhoneCode(false)
    }
  }

  // 绑定手机
  const handleBindPhone = async () => {
    if (!phoneCode) {
      toast({
        title: "错误",
        description: "请输入验证码",
        variant: "destructive",
      })
      return
    }

    try {
      setBindingPhone(true)
      await bindPhone(newPhone, phoneCode)
      toast({
        title: "成功",
        description: "手机绑定成功",
      })
      setNewPhone("")
      setPhoneCode("")
      setShowPhoneCode(false)
    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "手机绑定失败",
        variant: "destructive",
      })
    } finally {
      setBindingPhone(false)
    }
  }

  // 修改密码
  const handleChangePassword = async () => {
    if (!oldPassword) {
      toast({
        title: "错误",
        description: "请输入当前密码",
        variant: "destructive",
      })
      return
    }

    if (!newPassword) {
      toast({
        title: "错误",
        description: "请输入新密码",
        variant: "destructive",
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        title: "错误",
        description: "密码至少6位",
        variant: "destructive",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "错误",
        description: "两次输入的新密码不一致",
        variant: "destructive",
      })
      return
    }

    try {
      setChangingPassword(true)
      const success = await changePassword(oldPassword, newPassword)
      if (success) {
        toast({
          title: "成功",
          description: "密码修改成功，请重新登录",
        })
        setOldPassword("")
        setNewPassword("")
        setConfirmPassword("")
        onOpenChange(false)
      } else {
        toast({
          title: "错误",
          description: "当前密码错误",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "密码修改失败",
        variant: "destructive",
      })
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>个人资料</DialogTitle>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profile">个人资料</TabsTrigger>
              <TabsTrigger value="email">邮箱</TabsTrigger>
              <TabsTrigger value="phone">手机</TabsTrigger>
              <TabsTrigger value="password">密码</TabsTrigger>
            </TabsList>
            
            <TabsContent value="profile" className="space-y-4">
              {/* 头像 */}
              <div className="flex flex-col items-center space-y-2">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={user?.avatar || undefined} />
                    <AvatarFallback className="text-lg">
                      {user?.name?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <label
                    htmlFor="avatar-upload"
                    className="absolute bottom-0 right-0 cursor-pointer rounded-full bg-primary p-1.5 text-primary-foreground hover:bg-primary/90"
                  >
                    <Camera className="h-4 w-4" />
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                      disabled={uploading}
                    />
                  </label>
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/50">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* 姓名 */}
              <div className="space-y-2">
                <Label htmlFor="name">姓名</Label>
                <div className="flex gap-2">
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="请输入姓名"
                  />
                  <Button onClick={handleSaveName} disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
                  </Button>
                </div>
              </div>

              {/* 用户信息展示 */}
              <div className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">用户ID:</span>
                  <span className="font-mono">{user?.id}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">邮箱:</span>
                  <span>{user?.email || '未绑定'}</span>
                  {user?.emailVerified && (
                    <span className="text-xs text-green-500">(已验证)</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">手机:</span>
                  <span>{user?.phone || '未绑定'}</span>
                  {user?.phoneVerified && (
                    <span className="text-xs text-green-500">(已验证)</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">角色:</span>
                  <span className="capitalize">{user?.role || 'user'}</span>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="email" className="space-y-4">
              {user?.email ? (
                <div className="space-y-2">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">当前邮箱</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        {user.emailVerified && (
                          <p className="text-xs text-green-500 mt-1">已验证</p>
                        )}
                      </div>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => setShowUnbindConfirm(true)}
                        disabled={unbindingEmail}
                      >
                        {unbindingEmail ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-1" />
                            解绑
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4" key={emailFormKey}>
                  <div className="space-y-2">
                    <Label htmlFor="email">邮箱</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="请输入邮箱"
                      autoComplete="off"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password">密码</Label>
                    <Input
                      id="password"
                      type="password"
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      placeholder="请输入密码"
                      autoComplete="off"
                    />
                  </div>

                  {!showEmailCode ? (
                    <Button 
                      onClick={handleSendEmailCode} 
                      disabled={sendingEmailCode || !newEmail || !emailPassword}
                      className="w-full"
                    >
                      {sendingEmailCode ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          发送中...
                        </>
                      ) : (
                        "发送验证码"
                      )}
                    </Button>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="code">验证码</Label>
                        <Input
                          id="code"
                          value={emailCode}
                          onChange={(e) => setEmailCode(e.target.value)}
                          placeholder="请输入验证码"
                          autoComplete="off"
                        />
                      </div>
                      
                      <Button 
                        onClick={handleBindEmail} 
                        disabled={bindingEmail || !emailCode}
                        className="w-full"
                      >
                        {bindingEmail ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            绑定中...
                          </>
                        ) : (
                          "确认绑定"
                        )}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="phone" className="space-y-4">
              {user?.phone ? (
                <div className="space-y-2">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">当前手机</p>
                        <p className="text-sm text-muted-foreground">{user.phone}</p>
                        {user.phoneVerified && (
                          <p className="text-xs text-green-500 mt-1">已验证</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">手机号</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="请输入手机号"
                      autoComplete="off"
                    />
                  </div>

                  {!showPhoneCode ? (
                    <Button 
                      onClick={handleSendPhoneCode} 
                      disabled={sendingPhoneCode || !newPhone}
                      className="w-full"
                    >
                      {sendingPhoneCode ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          发送中...
                        </>
                      ) : (
                        "发送验证码"
                      )}
                    </Button>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="code">验证码</Label>
                        <Input
                          id="code"
                          value={phoneCode}
                          onChange={(e) => setPhoneCode(e.target.value)}
                          placeholder="请输入验证码"
                          autoComplete="off"
                        />
                      </div>
                      
                      <Button 
                        onClick={handleBindPhone} 
                        disabled={bindingPhone || !phoneCode}
                        className="w-full"
                      >
                        {bindingPhone ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            绑定中...
                          </>
                        ) : (
                          "确认绑定"
                        )}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </TabsContent>

            {/* 修改密码标签页 - 使用独立的key */}
            <TabsContent value="password" className="space-y-4" key={passwordFormKey}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="old-password">当前密码</Label>
                  <Input
                    id="old-password"
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="请输入当前密码"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">新密码</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="请输入新密码"
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-400">密码至少6位</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">确认新密码</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="请再次输入新密码"
                    autoComplete="off"
                  />
                </div>

                <Button 
                  onClick={handleChangePassword} 
                  disabled={changingPassword || !oldPassword || !newPassword || !confirmPassword}
                  className="w-full"
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      修改中...
                    </>
                  ) : (
                    "确认修改"
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* 解绑确认对话框 */}
      <AlertDialog open={showUnbindConfirm} onOpenChange={setShowUnbindConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认解绑邮箱</AlertDialogTitle>
            <AlertDialogDescription>
              解绑邮箱后，您将无法使用该邮箱登录。确定要继续吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnbindEmail} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认解绑
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster />
    </>
  )
}
