import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn, Search, ArrowLeft, Eye, EyeOff } from "lucide-react";

type Branch = { value: string; label1: string; label2?: string };
type AcademyBrand = { brandNo: string; name: string; logo?: string | null; source?: string };
type PartnerSearchResponse = AcademyBrand & { brands?: AcademyBrand[] };

const SAVED_CREDENTIALS_KEY = "flipedu_saved_credentials";

type SavedCredentials = {
  academyName: string;
  brandNo: string;
  branchNo: string;
  username: string;
  credential: string;
  branches: Branch[];
};

function loadSavedCredentials(): SavedCredentials | null {
  try {
    const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

function saveCreds(data: SavedCredentials) {
  try {
    localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify(data));
  } catch {}
}

function clearSavedCredentials() {
  try {
    localStorage.removeItem(SAVED_CREDENTIALS_KEY);
  } catch {}
}

async function getErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return typeof data?.message === "string" ? data.message : fallback;
  } catch {
    return fallback;
  }
}

function getSavedInitial() {
  try {
    return loadSavedCredentials();
  } catch {
    return null;
  }
}

function formatBranchLabel(branch: Branch) {
  return branch.label2 ? `${branch.label1} ${branch.label2}` : branch.label1;
}

function formatBrandLabel(brand: AcademyBrand) {
  return `${brand.name}${brand.brandNo ? ` (#${brand.brandNo})` : ""}`;
}

function normalizeBrandCandidates(data: PartnerSearchResponse, fallbackName: string): AcademyBrand[] {
  const rawBrands = Array.isArray(data.brands) && data.brands.length > 0
    ? data.brands
    : [{ brandNo: data.brandNo, name: data.name || fallbackName, logo: data.logo, source: data.source }];

  const seen = new Set<string>();
  return rawBrands
    .map((brand) => ({
      brandNo: String(brand.brandNo || "").trim(),
      name: String(brand.name || fallbackName).trim(),
      logo: brand.logo ?? null,
      source: brand.source,
    }))
    .filter((brand) => {
      if (!brand.brandNo || seen.has(brand.brandNo)) return false;
      seen.add(brand.brandNo);
      return true;
    });
}

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [saved] = useState(() => getSavedInitial());
  const [rememberMe, setRememberMe] = useState(!!saved);

  const [step, setStep] = useState<"search" | "brand" | "login">(saved ? "login" : "search");
  const [academyName, setAcademyName] = useState(saved?.academyName || "");
  const [brandNo, setBrandNo] = useState(saved?.brandNo || "");
  const [brandCandidates, setBrandCandidates] = useState<AcademyBrand[]>([]);
  const [selectedBrandNo, setSelectedBrandNo] = useState(saved?.brandNo || "");
  const [branches, setBranches] = useState<Branch[]>(saved?.branches || []);
  const [selectedBranch, setSelectedBranch] = useState(saved?.branchNo || "");
  const [username, setUsername] = useState(saved?.username || "");
  const [password, setPassword] = useState(() => {
    if (!saved?.credential) return "";
    try { return decodeURIComponent(atob(saved.credential)); } catch { return ""; }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadBranchesForBrand = async (brand: AcademyBrand, fallbackName = academyName.trim()) => {
    if (!brand.brandNo) {
      toast({ title: "검색 실패", description: "브랜드 정보를 확인할 수 없습니다.", variant: "destructive" });
      return;
    }

    setIsSearching(true);
    try {
      const branchRes = await fetch(`/api/auth/branches?brandNo=${encodeURIComponent(brand.brandNo)}`);
      if (!branchRes.ok) {
        toast({
          title: "오류",
          description: await getErrorMessage(branchRes, "지점 목록을 불러올 수 없습니다."),
          variant: "destructive",
        });
        return;
      }
      const branchData: Branch[] = await branchRes.json();
      if (!Array.isArray(branchData) || branchData.length === 0) {
        toast({ title: "검색 실패", description: "해당 학원의 지점을 찾을 수 없습니다.", variant: "destructive" });
        return;
      }
      setAcademyName(brand.name || fallbackName);
      setBrandNo(brand.brandNo);
      setSelectedBrandNo(brand.brandNo);
      setBranches(branchData);
      setSelectedBranch(branchData[0].value);
      setStep("login");
    } catch {
      toast({ title: "오류", description: "지점 조회 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async () => {
    const inputName = academyName.trim();
    if (!inputName) {
      toast({ title: "알림", description: "학원명 또는 브랜드 번호를 입력해주세요.", variant: "destructive" });
      return;
    }

    setBrandNo("");
    setSelectedBrandNo("");
    setBrandCandidates([]);
    setBranches([]);
    setSelectedBranch("");
    setIsSearching(true);

    try {
      if (/^\d+$/.test(inputName)) {
        await loadBranchesForBrand({ brandNo: inputName, name: inputName, logo: null, source: "manual" }, inputName);
        return;
      }

      const partnerRes = await fetch(`/api/auth/partners?name=${encodeURIComponent(inputName)}`);
      if (!partnerRes.ok) {
        toast({
          title: "검색 실패",
          description: await getErrorMessage(partnerRes, "해당 학원을 찾을 수 없습니다. 학원명 또는 브랜드 번호를 입력해주세요."),
          variant: "destructive",
        });
        return;
      }

      const partnerData: PartnerSearchResponse = await partnerRes.json();
      const candidates = normalizeBrandCandidates(partnerData, inputName);
      if (candidates.length === 0) {
        toast({ title: "검색 실패", description: "검색 결과에서 브랜드 번호를 찾을 수 없습니다.", variant: "destructive" });
        return;
      }

      setBrandCandidates(candidates);
      setSelectedBrandNo(candidates[0].brandNo);

      if (candidates.length === 1) {
        await loadBranchesForBrand(candidates[0], inputName);
        return;
      }

      setStep("brand");
    } catch {
      toast({ title: "오류", description: "학원 검색 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      toast({ title: "알림", description: "아이디와 비밀번호를 입력해주세요.", variant: "destructive" });
      return;
    }
    if (!selectedBranch) {
      toast({ title: "알림", description: "지점을 선택해주세요.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const credential = btoa(encodeURIComponent(password.trim()));
      const selectedBranchObj = branches.find(b => b.value === selectedBranch);
      const branchLabel = selectedBranchObj ? formatBranchLabel(selectedBranchObj) : "";
      await login({
        brandNo,
        branchNo: selectedBranch,
        username: username.trim(),
        credential,
        brandName: academyName.trim(),
        branchName: branchLabel,
      });
      if (rememberMe) {
        saveCreds({
          academyName: academyName.trim(),
          brandNo,
          branchNo: selectedBranch,
          username: username.trim(),
          credential,
          branches,
        });
      } else {
        clearSavedCredentials();
      }
      setLocation("/");
    } catch (err: any) {
      let description = "로그인에 실패했습니다.";
      if (err?.message) {
        try {
          const bodyStr = err.message.replace(/^\d+:\s*/, "");
          const parsed = JSON.parse(bodyStr);
          if (parsed.message) description = parsed.message;
        } catch {}
      }
      toast({ title: "로그인 실패", description, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const goBack = () => {
    setStep("search");
    setBrandNo("");
    setSelectedBrandNo("");
    setBrandCandidates([]);
    setBranches([]);
    setSelectedBranch("");
    setUsername("");
    setPassword("");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-md mx-auto px-6">
        <div className="border border-gray-200 rounded-xl p-8 bg-white shadow-sm">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-blue-500 tracking-wider mb-2 italic" data-testid="text-login-title">LOGIN</h1>
            <p className="text-[14px] text-gray-500">
              플립에듀 Editor 로그인
            </p>
          </div>

          {step === "search" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[12px] text-gray-600 font-medium">학원명 또는 브랜드번호</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="정확한 학원명 또는 brandNo 숫자"
                    className="border-gray-300 h-11 text-[13px] placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-blue-500 flex-1"
                    value={academyName}
                    onChange={(e) => setAcademyName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                    disabled={isSearching}
                    data-testid="input-academy-name"
                  />
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white h-11 px-4"
                    onClick={handleSearch}
                    disabled={isSearching}
                    data-testid="button-search-academy"
                  >
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : step === "brand" ? (
            <div className="space-y-4">
              <button
                onClick={goBack}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-[13px] transition-colors"
                data-testid="button-back-to-search"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>다시 검색</span>
              </button>

              <div className="space-y-2">
                <label className="text-[12px] text-gray-600 font-medium">브랜드 선택</label>
                <Select value={selectedBrandNo} onValueChange={setSelectedBrandNo}>
                  <SelectTrigger
                    className="border-gray-300 h-11 text-[13px] focus:ring-1 focus:ring-blue-500"
                    data-testid="select-brand"
                  >
                    <SelectValue placeholder="브랜드를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {brandCandidates.map((brand) => (
                      <SelectItem key={brand.brandNo} value={brand.brandNo} className="text-[13px]">
                        {formatBrandLabel(brand)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[12px] text-gray-500">
                  검색어와 일치하는 브랜드가 여러 개 있습니다. 로그인할 브랜드를 선택해주세요.
                </p>
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 text-[13px] font-medium"
                onClick={() => {
                  const brand = brandCandidates.find((candidate) => candidate.brandNo === selectedBrandNo);
                  if (brand) loadBranchesForBrand(brand);
                }}
                disabled={isSearching || !selectedBrandNo}
                data-testid="button-load-branches"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                지점 불러오기
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={goBack}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-[13px] transition-colors"
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>학원: {academyName}</span>
              </button>

              <div className="space-y-2">
                <label className="text-[12px] text-gray-600 font-medium">지점</label>
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger
                    className="border-gray-300 h-11 text-[13px] focus:ring-1 focus:ring-blue-500"
                    data-testid="select-branch"
                  >
                    <SelectValue placeholder="지점을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.value} value={b.value} className="text-[13px]">
                        {formatBranchLabel(b)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-[12px] text-gray-600 font-medium">아이디</label>
                <Input
                  placeholder="아이디를 입력하세요"
                  className="border-gray-300 h-11 text-[13px] placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-blue-500"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                  data-testid="input-username"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[12px] text-gray-600 font-medium">비밀번호</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="비밀번호를 입력하세요"
                    className="border-gray-300 h-11 text-[13px] placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-blue-500 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
                    disabled={isSubmitting}
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <Checkbox 
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(!!checked)}
                  className="border-gray-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  data-testid="checkbox-remember-me"
                />
                <label htmlFor="remember-me" className="text-[12px] text-gray-600 cursor-pointer select-none">
                  로그인 정보 저장
                </label>
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 text-[13px] font-medium mt-2"
                onClick={handleLogin}
                disabled={isSubmitting}
                data-testid="button-login"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <LogIn className="w-4 h-4 mr-2" />
                )}
                로그인
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
