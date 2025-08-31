export interface Account {
  email: string;
  key: string;
  createdAt: Date;
  accountId?: string;  // Auto-generated Firestore document ID
}

export interface AccountManager {
  /**
   * Gets existing account by accountId
   * @param accountId Account ID (Firestore document ID)
   * @returns Account if found, null if not found
   */
  getAccount(accountId: string): Promise<Account | null>;
}