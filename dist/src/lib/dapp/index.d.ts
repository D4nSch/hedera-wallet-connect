import { AccountId, LedgerId } from '@hashgraph/sdk';
import { SessionTypes, SignClientTypes } from '@walletconnect/types';
import { WalletConnectModal } from '@walletconnect/modal';
import SignClient from '@walletconnect/sign-client';
import { GetNodeAddressesResult, ExecuteTransactionParams, ExecuteTransactionResult, SignMessageParams, SignMessageResult, SignAndExecuteQueryResult, SignAndExecuteQueryParams, SignAndExecuteTransactionParams, SignAndExecuteTransactionResult, SignTransactionParams, SignTransactionResult, ExtensionData } from '../shared';
import { DAppSigner } from './DAppSigner';
export * from './DAppSigner';
type BaseLogger = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'fatal';
export declare class DAppConnector {
    dAppMetadata: SignClientTypes.Metadata;
    network: LedgerId;
    projectId: string;
    supportedMethods: string[];
    supportedEvents: string[];
    supportedChains: string[];
    extensions: ExtensionData[];
    onSessionIframeCreated: ((session: SessionTypes.Struct) => void) | null;
    walletConnectClient: SignClient | undefined;
    walletConnectModal: WalletConnectModal;
    signers: DAppSigner[];
    isInitializing: boolean;
    /**
     * Initializes the DAppConnector instance.
     * @param metadata - SignClientTypes.Metadata object for the DApp metadata.
     * @param network - LedgerId representing the network (default: LedgerId.TESTNET).
     * @param projectId - Project ID for the WalletConnect client.
     * @param methods - Array of supported methods for the DApp (optional).
     * @param events - Array of supported events for the DApp (optional).
     * @param chains - Array of supported chains for the DApp (optional).
     */
    constructor(metadata: SignClientTypes.Metadata, network: LedgerId, projectId: string, methods?: string[], events?: string[], chains?: string[]);
    /**
     * Initializes the DAppConnector instance.
     * @param logger - `BaseLogger` for logging purposes (optional).
     */
    init({ logger }?: {
        logger?: BaseLogger;
    }): Promise<void>;
    getSigner(accountId: AccountId): DAppSigner;
    /**
     * Initiates the WalletConnect connection flow using a QR code.
     * @deprecated Use `openModal` instead.
     * @param pairingTopic - The pairing topic for the connection (optional).
     * @returns A Promise that resolves when the connection process is complete.
     */
    connectQR(pairingTopic?: string): Promise<void>;
    /**
     * Initiates the WalletConnect connection flow using a QR code.
     * @param pairingTopic - The pairing topic for the connection (optional).
     * @returns {Promise<SessionTypes.Struct>} - A Promise that resolves when the connection process is complete.
     */
    openModal(pairingTopic?: string): Promise<SessionTypes.Struct>;
    /**
     * Initiates the WallecConnect connection flow using URI.
     * @param pairingTopic - The pairing topic for the connection (optional).
     * @param extensionId - The id for the extension used to connect (optional).
     * @returns A Promise that resolves when the connection process is complete.
     */
    connect(launchCallback: (uri: string) => void, pairingTopic?: string, extensionId?: string): Promise<SessionTypes.Struct>;
    /**
     * Initiates the WallecConnect connection flow sending a message to the extension.
     * @param extensionId - The id for the extension used to connect.
     * @param pairingTopic - The pairing topic for the connection (optional).
     * @returns A Promise that resolves when the connection process is complete.
     */
    connectExtension(extensionId: string, pairingTopic?: string): Promise<SessionTypes.Struct>;
    /**
     *  Initiates the WallecConnect connection if the wallet in iframe mode is detected.
     */
    private checkIframeConnect;
    private abortableConnect;
    /**
     * Disconnects the current session associated with the specified topic.
     * @param topic - The topic of the session to disconnect.
     * @returns A Promise that resolves when the session is disconnected.
     */
    disconnect(topic: string): Promise<void>;
    /**
     * Disconnects all active sessions and pairings.
     *
     * Throws error when WalletConnect is not initialized or there are no active sessions/pairings.
     * @returns A Promise that resolves when all active sessions and pairings are disconnected.
     */
    disconnectAll(): Promise<void>;
    private createSigners;
    private onSessionConnected;
    private connectURI;
    private request;
    /**
     * Retrieves the node addresses associated with the current Hedera network.
     *
     * When there is no active session or an error occurs during the request.
     * @returns Promise\<{@link GetNodeAddressesResult}\>
     */
    getNodeAddresses(): Promise<GetNodeAddressesResult>;
    /**
     * Executes a transaction on the Hedera network.
     *
     * @param {ExecuteTransactionParams} params - The parameters of type {@link ExecuteTransactionParams | `ExecuteTransactionParams`} required for the transaction execution.
     * @param {string[]} params.signedTransaction - Array of Base64-encoded `Transaction`'s
     * @returns Promise\<{@link ExecuteTransactionResult}\>
     * @example
     * Use helper `transactionToBase64String` to encode `Transaction` to Base64 string
     * ```ts
     * const params = {
     *  signedTransaction: [transactionToBase64String(transaction)]
     * }
     *
     * const result = await dAppConnector.executeTransaction(params)
     * ```
     */
    executeTransaction(params: ExecuteTransactionParams): Promise<ExecuteTransactionResult>;
    /**
     * Signs a provided `message` with provided `signerAccountId`.
     *
     * @param {SignMessageParams} params - The parameters of type {@link SignMessageParams | `SignMessageParams`} required for signing message.
     * @param {string} params.signerAccountId - a signer Hedera Account identifier in {@link https://hips.hedera.com/hip/hip-30 | HIP-30} (`<nework>:<shard>.<realm>.<num>`) form.
     * @param {string} params.message - a plain UTF-8 string
     * @returns Promise\<{@link SignMessageResult}\>
     * @example
     * ```ts
     * const params = {
     *  signerAccountId: '0.0.12345',
     *  message: 'Hello World!'
     * }
     *
     * const result = await dAppConnector.signMessage(params)
     * ```
     */
    signMessage(params: SignMessageParams): Promise<SignMessageResult>;
    /**
     * Signs and send `Query` on the Hedera network.
     *
     * @param {SignAndExecuteQueryParams} params - The parameters of type {@link SignAndExecuteQueryParams | `SignAndExecuteQueryParams`} required for the Query execution.
     * @param {string} params.signerAccountId - a signer Hedera Account identifier in {@link https://hips.hedera.com/hip/hip-30 | HIP-30} (`<nework>:<shard>.<realm>.<num>`) form.
     * @param {string} params.query - `Query` object represented as Base64 string
     * @returns Promise\<{@link SignAndExecuteQueryResult}\>
     * @example
     * Use helper `queryToBase64String` to encode `Query` to Base64 string
     * ```ts
     * const params = {
     *  signerAccountId: '0.0.12345',
     *  query: queryToBase64String(query),
     * }
     *
     * const result = await dAppConnector.signAndExecuteQuery(params)
     * ```
     */
    signAndExecuteQuery(params: SignAndExecuteQueryParams): Promise<SignAndExecuteQueryResult>;
    /**
     * Signs and executes Transactions on the Hedera network.
     *
     * @param {SignAndExecuteTransactionParams} params - The parameters of type {@link SignAndExecuteTransactionParams | `SignAndExecuteTransactionParams`} required for `Transaction` signing and execution.
     * @param {string} params.signerAccountId - a signer Hedera Account identifier in {@link https://hips.hedera.com/hip/hip-30 | HIP-30} (`<nework>:<shard>.<realm>.<num>`) form.
     * @param {string[]} params.transaction - Array of Base64-encoded `Transaction`'s
     * @returns Promise\<{@link SignAndExecuteTransactionResult}\>
     * @example
     * Use helper `transactionToBase64String` to encode `Transaction` to Base64 string
     * ```ts
     * const params = {
     *  signerAccountId: '0.0.12345'
     *  transaction: [transactionToBase64String(transaction)]
     * }
     *
     * const result = await dAppConnector.signAndExecuteTransaction(params)
     * ```
     */
    signAndExecuteTransaction(params: SignAndExecuteTransactionParams): Promise<SignAndExecuteTransactionResult>;
    /**
     * Signs and executes Transactions on the Hedera network.
     *
     * @param {SignTransactionParams} params - The parameters of type {@link SignTransactionParams | `SignTransactionParams`} required for `Transaction` signing.
     * @param {string} params.signerAccountId - a signer Hedera Account identifier in {@link https://hips.hedera.com/hip/hip-30 | HIP-30} (`<nework>:<shard>.<realm>.<num>`) form.
     * @param {string[]} params.transaction - Array of Base64-encoded `Transaction`'s
     * @returns Promise\<{@link SignTransactionResult}\>
     * @example
     * ```ts
     * const transactionBodyObject = transactionToTransactionBody(transaction, AccountId.fromString('0.0.3'))
     * const transactionBody = transactionBodyToBase64String(transactionBodyObject)
     *
     * const params = {
     *  signerAccountId: '0.0.12345',
     *  transactionBody
     * }
     *
     * const result = await dAppConnector.signTransaction(params)
     * ```
     */
    signTransaction(params: SignTransactionParams): Promise<SignTransactionResult>;
}
export default DAppConnector;
