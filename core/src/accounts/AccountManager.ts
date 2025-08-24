export interface Account {
  email: string;
  key: string;
  createdAt: Date;
  accountId?: string;  // Auto-generated Firestore document ID
}

export interface AccountManager {
  /**
   * Gets existing account by email or creates new one
   * @param email User email address
   * @returns Account with accountId always populated from Firestore document ID
   */
  getOrCreateAccount(email: string): Promise<Account>;

  /**
   * Gets existing account by accountId
   * @param accountId Account ID (Firestore document ID)
   * @returns Account if found, null if not found
   */
  getAccount(accountId: string): Promise<Account | null>;

  /**
   * Saves magic token with 5-minute expiry
   * @param token Encrypted token string
   * @param email Associated email address
   */
  saveMagicToken(token: string, email: string): Promise<void>;

  /**
   * Validates and marks magic token as used
   * @param token Encrypted token string
   * @returns true if token was valid and unused, false if invalid/expired/used
   */
  markMagicTokenUsed(token: string): Promise<boolean>;
}