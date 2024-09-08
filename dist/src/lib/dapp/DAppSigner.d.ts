import { Signer, AccountBalance, AccountId, AccountInfo, Executable, Key, LedgerId, SignerSignature, Transaction, TransactionRecord } from '@hashgraph/sdk';
import type { ISignClient } from '@walletconnect/types';
export declare class DAppSigner implements Signer {
    private readonly accountId;
    private readonly signClient;
    readonly topic: string;
    private readonly ledgerId;
    readonly extensionId?: string | undefined;
    constructor(accountId: AccountId, signClient: ISignClient, topic: string, ledgerId?: LedgerId, extensionId?: string | undefined);
    private _getHederaClient;
    private get _signerAccountId();
    private _getRandomNodes;
    request<T>(request: {
        method: string;
        params: any;
    }): Promise<T>;
    getAccountId(): AccountId;
    getAccountKey(): Key;
    getLedgerId(): LedgerId;
    getNetwork(): {
        [key: string]: string | AccountId;
    };
    getMirrorNetwork(): string[];
    getAccountBalance(): Promise<AccountBalance>;
    getAccountInfo(): Promise<AccountInfo>;
    getAccountRecords(): Promise<TransactionRecord[]>;
    sign(data: Uint8Array[], signOptions?: Record<string, any>): Promise<SignerSignature[]>;
    checkTransaction<T extends Transaction>(transaction: T): Promise<T>;
    populateTransaction<T extends Transaction>(transaction: T): Promise<T>;
    /**
     * Prepares a transaction object for signing using a single node account id.
     * If the transaction object does not already have a node account id,
     * generate a random node account id using the Hedera SDK client
     *
     * @param transaction - Any instance of a class that extends `Transaction`
     * @returns transaction - `Transaction` object with signature
     */
    signTransaction<T extends Transaction>(transaction: T): Promise<T>;
    private _tryExecuteTransactionRequest;
    private _parseQueryResponse;
    private _tryExecuteQueryRequest;
    call<RequestT, ResponseT, OutputT>(request: Executable<RequestT, ResponseT, OutputT>): Promise<OutputT>;
}
