import { useState } from "react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarGroup, SidebarGroupContent, SidebarFooter, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { FileText, Video, BookOpen, LogOut, Crown, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    } catch {}
  };

  const handleSaveToken = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    setTokenSaving(true);
    try {
      const res = await apiRequest("POST", "/api/auth/update-token", { token });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "토큰 저장 완료", description: "FlipEdu x-auth-token이 저장됐습니다. 이제 카테고리가 서버에 저장됩니다." });
        setTokenInput("");
        setTokenDialogOpen(false);
      } else {
        toast({ title: "토큰 저장 실패", description: data.message || "유효하지 않은 토큰입니다.", variant: "destructive" });
      }
    } catch {
      toast({ title: "토큰 저장 실패", description: "서버 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setTokenSaving(false);
    }
  };

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground" collapsible="icon">
      <SidebarHeader className={`pb-3 ${isCollapsed ? 'px-0 pt-3' : 'px-4 pt-4'}`}>
        {!isCollapsed && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-[15px] font-bold text-foreground/80 tracking-widest uppercase" data-testid="text-app-title">FLIPEDU EDITOR</h1>
              <SidebarTrigger className="shrink-0 text-muted-foreground hover:text-foreground" data-testid="button-sidebar-toggle" />
            </div>
            {(brandName || branchName) && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 rounded-md border border-blue-100" data-testid="text-brand-branch">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span className="text-[13px] font-semibold text-blue-700 truncate">
                  {[brandName, branchName?.replace(/\s*DIRECT\s*/gi, "").trim()].filter(Boolean).join(" · ")}
                </span>
              </div>
            )}
          </div>
        )}
        {isCollapsed && (
          <div className="flex justify-center">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" data-testid="button-sidebar-toggle" />
          </div>
        )}
      </SidebarHeader>
      
      <SidebarContent className={`pt-2 ${isCollapsed ? 'px-0' : 'px-2'}`}>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={(location === "/" || location.startsWith("/create")) && !location.startsWith("/video")}
                  tooltip="나만의 쉐도잉"
                  className="h-10 w-full rounded-lg transition-all data-[active=true]:bg-sidebar-primary data-[active=true]:text-white hover:bg-sidebar-accent flex items-center group-data-[collapsible=icon]:justify-center px-3"
                >
                  <Link href="/" className="flex items-center w-full">
                    <FileText className="w-5 h-5 shrink-0" />
                    <span className="ml-3 font-medium text-[13px] group-data-[collapsible=icon]:hidden">나만의 쉐도잉</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={location === "/video" || location.startsWith("/video")}
                  tooltip="나만의 영상"
                  className="h-10 w-full rounded-lg transition-all data-[active=true]:bg-sidebar-primary data-[active=true]:text-white hover:bg-sidebar-accent flex items-center group-data-[collapsible=icon]:justify-center px-3"
                >
                  <Link href="/video" className="flex items-center w-full">
                    <Video className="w-5 h-5 shrink-0" />
                    <span className="ml-3 font-medium text-[13px] group-data-[collapsible=icon]:hidden">나만의 영상</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={location === "/worksheet" || location.startsWith("/worksheet")}
                  tooltip="나만의 학습지"
                  className="h-10 w-full rounded-lg transition-all data-[active=true]:bg-sidebar-primary data-[active=true]:text-white hover:bg-sidebar-accent flex items-center group-data-[collapsible=icon]:justify-center px-3"
                >
                  <Link href="/worksheet" className="flex items-center w-full">
                    <BookOpen className="w-5 h-5 shrink-0" />
                    <span className="ml-3 font-medium text-[13px] group-data-[collapsible=icon]:hidden">나만의 학습지</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={`border-t border-sidebar-border ${isCollapsed ? 'p-1' : 'p-2'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className={`flex items-center gap-3 w-full ${isCollapsed ? 'justify-center' : 'px-2'}`}>
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-[11px] font-bold text-white">
                {initials}
              </div>
              {isAdmin && (
                <div className="absolute -top-2 -right-1.5" data-testid="icon-admin-crown">
                  <Crown className="w-4 h-4 text-amber-500 fill-amber-400 drop-shadow-sm" />
                </div>
              )}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[12px] font-medium text-sidebar-foreground truncate" data-testid="text-username">
                    {displayName}
                  </span>
                  <span className="text-[12px] font-medium text-sidebar-foreground shrink-0" data-testid="text-teacher-label">선생님</span>
                </div>
                {isAdmin && (
                  <span className="text-[10px] text-amber-600 font-medium" data-testid="text-admin-label">관리자</span>
                )}
              </div>
            )}
            <div className={`flex items-center gap-1 ${isCollapsed ? 'mt-1 justify-center flex-col' : 'ml-auto'}`}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                onClick={() => setTokenDialogOpen(true)}
                title="FlipEdu API 토큰 설정"
                data-testid="btn-set-token"
              >
                <KeyRound className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                onClick={() => setLogoutDialogOpen(true)}
                data-testid="btn-logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </SidebarFooter>

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>로그아웃</AlertDialogTitle>
            <AlertDialogDescription>
              로그아웃하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleLogout}
            >
              로그아웃
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-600" />
              FlipEdu API 토큰 설정
            </DialogTitle>
            <DialogDescription className="text-[13px] space-y-2 pt-1">
              <span className="block">문항 카테고리를 FlipEdu 서버에 직접 저장하려면 <strong>x-auth-token</strong>이 필요합니다.</span>
              <span className="block text-muted-foreground">
                가져오는 방법: <strong>editor.flipedu.net</strong> 접속 → 개발자 도구(F12) → Network 탭 → 아무 API 요청 클릭 → Request Headers의 <code className="bg-muted px-1 rounded">x-auth-token</code> 값 복사
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="token-input" className="text-[13px]">x-auth-token 값</Label>
              <Input
                id="token-input"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                className="font-mono text-[12px]"
                data-testid="input-auth-token"
              />
            </div>
            {tokenInput && (
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                {/^[0-9a-f-]{30,}$/i.test(tokenInput.trim()) ? (
                  <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> UUID 형식 맞음</>
                ) : (
                  <><XCircle className="w-3.5 h-3.5 text-red-400" /> 형식을 확인해주세요</>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleSaveToken}
              disabled={!tokenInput.trim() || tokenSaving}
              data-testid="btn-save-token"
            >
              {tokenSaving ? "확인 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
