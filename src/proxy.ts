import { NextRequest, NextResponse } from "next/server";
/** Hosted operator access. Local development remains on loopback. */
export function proxy(request: NextRequest) {
  if (!process.env.VERCEL) return NextResponse.next();
  const username = process.env.OPERATOR_USERNAME,
    password = process.env.OPERATOR_PASSWORD;
  if (!username || !password)
    return new NextResponse("Operator access is not configured.", {
      status: 503,
    });
  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  if (request.headers.get("authorization") !== expected)
    return new NextResponse("Operator sign-in required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="ShelfSense", charset="UTF-8"',
      },
    });
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
