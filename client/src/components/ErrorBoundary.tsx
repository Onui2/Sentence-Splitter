import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[ErrorBoundary] caught:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-background gap-4 px-6 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
          <h2 className="text-[16px] font-semibold">페이지를 불러오는 중 오류가 발생했습니다</h2>
          <p className="text-[13px] text-muted-foreground max-w-sm">
            {this.state.error?.message || "알 수 없는 오류가 발생했습니다. 페이지를 새로 고침해 주세요."}
          </p>
          <Button onClick={this.handleReset} size="sm" className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            새로 고침
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
