import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Home from "@/pages/Home";
import MaterialDetail from "@/pages/MaterialDetail";
import ShadowingCreate from "@/pages/ShadowingCreate";
import VideoHome from "@/pages/VideoHome";
import WorksheetHome from "@/pages/WorksheetHome";
import PRDDocument from "@/pages/PRDDocument";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { createContext, useContext, useEffect, useState } from "react";
import { Loader2, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

function MobileHeader() {
  const isMobile = useIsMobile();
  const { toggleSidebar } = useSidebar();
  
  if (!isMobile) return null;
  
  return (
    <div className="flex items-center h-12 px-3 border-b border-border bg-background md:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={toggleSidebar}
        data-testid="btn-mobile-sidebar-toggle"
      >
        <Menu className="w-4 h-4" />
      </Button>
      <span className="ml-2 text-[14px] font-bold text-foreground/80 tracking-widest uppercase">FLIPEDU EDITOR</span>
    </div>
  );
}

function ProtectedRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user?.authenticated) {
    return <Login />;
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <MobileHeader />
          <main className="flex-1 overflow-y-auto">
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/create" component={ShadowingCreate} />
              <Route path="/video" component={VideoHome} />
              <Route path="/worksheet" component={WorksheetHome} />
              <Route path="/material/:id" component={MaterialDetail} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

function AppRouter() {
  const [location] = useLocation();

  if (location === "/prd" || location === "/prd/") {
    return <PRDDocument />;
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ProtectedRouter />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="shadowing-theme">
        <TooltipProvider>
          <AppRouter />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
