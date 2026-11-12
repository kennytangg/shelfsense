/** Values shared between global setup and the test workers through the environment. */
export const ENV = {
  baseUrl: "E2E_BASE_URL",
  gateUrl: "E2E_GATE_URL",
  operatorUser: "E2E_OPERATOR_USERNAME",
  operatorPassword: "E2E_OPERATOR_PASSWORD",
} as const;

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Run the suite with "npm run test:e2e" so global setup can start the server.`,
    );
  }
  return value;
}
