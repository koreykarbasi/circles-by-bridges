export async function importPKCS8(): Promise<unknown> {
  return {};
}

export class SignJWT {
  setProtectedHeader(): this {
    return this;
  }

  setIssuedAt(): this {
    return this;
  }

  setIssuer(): this {
    return this;
  }

  async sign(): Promise<string> {
    return "test-apns-jwt";
  }
}