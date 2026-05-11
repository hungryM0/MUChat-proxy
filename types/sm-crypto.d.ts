declare module "sm-crypto" {
  export const sm2: {
    doEncrypt(message: string, publicKey: string, cipherMode?: number): string;
  };
}
