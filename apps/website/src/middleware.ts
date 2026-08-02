import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/favicon.ico") {
    const url = request.nextUrl.clone();
    url.pathname = "/favicon";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/favicon.ico"],
};
