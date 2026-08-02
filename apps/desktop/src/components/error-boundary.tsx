"use client";

import React from "react";
import { LifeBuoy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-none bg-white shadow-lg">
          <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-5 px-6 py-14 text-center">
            <img
              src="/icon.png"
              alt="EduIgnite"
              className="h-20 w-20 object-contain"
            />
            <div className="space-y-2">
              <p className="text-5xl font-black text-primary">500</p>
              <h3 className="text-2xl font-black text-primary">
                {this.props.fallbackTitle || "Something went wrong on our end."}
              </h3>
              <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                This dashboard section failed to render. Retry it now or report the issue to EduIgnite support.
              </p>
            </div>
            {this.state.error && process.env.NODE_ENV === "development" ? (
              <details className="w-full max-w-xl rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-left">
                <summary className="cursor-pointer text-sm font-bold text-destructive">
                  Developer error details
                </summary>
                <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap text-xs text-destructive">
                  {this.state.error.message}
                </pre>
              </details>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={this.handleRetry} className="h-12 rounded-xl px-6 font-bold">
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-xl px-6 font-bold">
                <a href="/dashboard/support">
                  <LifeBuoy className="mr-2 h-4 w-4" />
                  Report Issue
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export function DashboardErrorBoundary({
  children,
  moduleName,
}: {
  children: React.ReactNode;
  moduleName: string;
}) {
  return (
    <ErrorBoundary fallbackTitle={`Error loading ${moduleName}`}>
      {children}
    </ErrorBoundary>
  );
}
