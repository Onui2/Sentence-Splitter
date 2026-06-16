import { useState } from "react";
import { BookA, BookOpen, CheckCircle2, Crown, FileText, KeyRound, LogOut, Video, XCircle } from "lucide-react";
import { Link, useLocation } from "wouter";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "./ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const navItems = [
  { href: "/", label: "나만의 쉐도잉", icon: FileText, active: (path: string) => path === "/" || path.startsWith("/create") },
  { href: "/worksheet", label: "나만의 학습지", icon: BookOpen, active: (path: string) => path.startsWith("/worksheet") },
  { href: "/words", label: "나만의 단어", icon: BookA, active: (path: string) => path.startsWith("/words") },
  { href: "/video", label: "나만의 영상", icon: Video, active: (path: string) => path.startsWith("/video") },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenSaving, setTokenSaving] = useState(false);

  const displayName = user?.username || "";
  const isAdmin = displayName.startsWith("{만능}");
  const cleanName = isAdmin ? displayName.replace("{만능}", "") : displayName;
  const initials = cleanName ? cleanName.substring(0, 1) : "?";
  const brandName = user?.brandName || "";
  const branchName = user?.branchName || "";

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      toast({ title: "로그아웃 실패", description: "다시 시도하세요.", variant: "destructive" });
    }
  };

  const handleSaveToken = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    setTokenSaving(true);
    try {
      const res = await apiRequest("POST", "/api/auth/update-token", { token });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "유효하지 않은 토큰입니다.");
      toast({ title: "토큰 저장 완료", description: "FlipEdu x-auth-token이 저장되었습니다." });
      setTokenInput("");
      setTokenDialogOpen(false);
    } catch (err: any) {
      toast({ title: "토큰 저장 실패", description: err?.message || "서버 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setTokenSaving(false);
    }
  };

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground" collapsible="icon">
      <SidebarHeader className={`pb-3 ${isCollapsed ? "px-0 pt-3" : "px-4 pt-4"}`}>
        {!isCollapsed ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-[15px] font-bold tracking-widest text-foreground/80" data-testid="text-app-title">
                FLIPEDU EDITOR
              </h1>
              <SidebarTrigger className="shrink-0 text-muted-foreground hover:text-foreground" data-testid="button-sidebar-toggle" />
            </div>
            {(brandName || branchName) && (
              <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1.5" data-testid="text-brand-branch">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span className="truncate text-[13px] font-semibold text-blue-700">
                  {[brandName, branchName?.replace(/\s*DIRECT\s*/gi, "").trim()].filter(Boolean).join(" · ")}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-center">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" data-testid="button-sidebar-toggle" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className={`pt-2 ${isCollapsed ? "px-0" : "px-2"}`}>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.active(location)}
                      tooltip={item.label}
                      className="h-10 w-full rounded-lg px-3 transition-all hover:bg-sidebar-accent data-[active=true]:bg-sidebar-primary data-[active=true]:text-white group-data-[collapsible=icon]:justify-center"
                    >
                      <Link href={item.href} className="flex w-full items-center">
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="ml-3 text-[13px] font-medium group-data-[collapsible=icon]:hidden">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={`border-t border-sidebar-border ${isCollapsed ? "p-1" : "p-2"}`}>
        <div className={`flex items-center gap-3 w-full ${isCollapsed ? "justify-center" : "px-2"}`}>
          <div className="relative shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
              {initials}
            </div>
            {isAdmin && (
              <div className="absolute -right-1.5 -top-2" data-testid="icon-admin-crown">
                <Crown className="h-4 w-4 fill-amber-400 text-amber-500 drop-shadow-sm" />
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-sidebar-foreground" data-testid="text-username">
                {displayName}
              </div>
              {isAdmin && <div className="text-[10px] font-medium text-amber-600">관리자</div>}
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTokenDialogOpen(true)} title="FlipEdu API 토큰 설정" data-testid="btn-set-token">
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLogoutDialogOpen(true)} data-testid="btn-logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>로그아웃</AlertDialogTitle>
            <AlertDialogDescription>로그아웃하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleLogout}>
              로그아웃
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-indigo-600" />
              FlipEdu API 토큰 설정
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1 text-[13px]">
              <span className="block">카테고리와 자료를 FlipEdu 서버에 직접 저장하려면 x-auth-token이 필요합니다.</span>
              <span className="block text-muted-foreground">
                editor.flipedu.app 접속 후 개발자 도구 Network 탭에서 API 요청의 Request Headers 값을 복사하세요.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="token-input" className="text-[13px]">x-auth-token</Label>
              <Input
                id="token-input"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                className="font-mono text-[12px]"
                data-testid="input-auth-token"
              />
            </div>
            {tokenInput && (
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                {/^[0-9a-f-]{30,}$/i.test(tokenInput.trim()) ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> UUID 형식으로 보입니다.</>
                ) : (
                  <><XCircle className="h-3.5 w-3.5 text-red-400" /> 토큰 형식을 확인하세요.</>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>취소</Button>
            <Button onClick={handleSaveToken} disabled={!tokenInput.trim() || tokenSaving} data-testid="btn-save-token">
              {tokenSaving ? "확인 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
