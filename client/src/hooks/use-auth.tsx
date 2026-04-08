import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";

type AuthState = {
  authenticated: boolean;
  username?: string;
  academyName?: string;
  brandName?: string;
  branchName?: string;
};

type AuthContextType = {
  user: AuthState | null | undefined;
  isLoading: boolean;
  login: (data: { brandNo: string; branchNo: string; username: string; credential: string; brandName?: string; branchName?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useQuery<AuthState>({
    queryKey: [api.auth.me.path],
    staleTime: 1000 * 60 * 5,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { brandNo: string; branchNo: string; username: string; credential: string; brandName?: string; branchName?: string }) => {
      const res = await apiRequest("POST", api.auth.login.path, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.removeQueries();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", api.auth.logout.path);
    },
    onSuccess: () => {
      queryClient.removeQueries();
    },
  });

  const login = async (data: { brandNo: string; branchNo: string; username: string; credential: string; brandName?: string; branchName?: string }) => {
    await loginMutation.mutateAsync(data);
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
