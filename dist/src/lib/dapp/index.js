/*
 *
 * Hedera Wallet Connect
 *
 * Copyright (C) 2023 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { LedgerId } from '@hashgraph/sdk';
import QRCodeModal from '@walletconnect/qrcode-modal';
import { WalletConnectModal } from '@walletconnect/modal';
import SignClient from '@walletconnect/sign-client';
import { getSdkError } from '@walletconnect/utils';
import { HederaJsonRpcMethod, accountAndLedgerFromSession, networkNamespaces, extensionConnect, findExtensions, } from '../shared';
import { DAppSigner } from './DAppSigner';
export * from './DAppSigner';
export class DAppConnector {
    /**
     * Initializes the DAppConnector instance.
     * @param metadata - SignClientTypes.Metadata object for the DApp metadata.
     * @param network - LedgerId representing the network (default: LedgerId.TESTNET).
     * @param projectId - Project ID for the WalletConnect client.
     * @param methods - Array of supported methods for the DApp (optional).
     * @param events - Array of supported events for the DApp (optional).
     * @param chains - Array of supported chains for the DApp (optional).
     */
    constructor(metadata, network, projectId, methods, events, chains) {
        this.network = LedgerId.TESTNET;
        this.supportedMethods = [];
        this.supportedEvents = [];
        this.supportedChains = [];
        this.extensions = [];
        this.onSessionIframeCreated = null;
        this.signers = [];
        this.isInitializing = false;
        this.abortableConnect = async (callback) => {
            return new Promise(async (resolve, reject) => {
                const pairTimeoutMs = 480000;
                const timeout = setTimeout(() => {
                    QRCodeModal.close();
                    reject(new Error(`Connect timed out after ${pairTimeoutMs}(ms)`));
                }, pairTimeoutMs);
                try {
                    return resolve(await callback());
                }
                catch (error) {
                    reject(error);
                }
                finally {
                    clearTimeout(timeout);
                }
            });
        };
        this.dAppMetadata = metadata;
        this.network = network;
        this.projectId = projectId;
        this.supportedMethods = methods !== null && methods !== void 0 ? methods : Object.values(HederaJsonRpcMethod);
        this.supportedEvents = events !== null && events !== void 0 ? events : [];
        this.supportedChains = chains !== null && chains !== void 0 ? chains : [];
        this.extensions = [];
        this.walletConnectModal = new WalletConnectModal({
            projectId: projectId,
            chains: chains,
        });
        findExtensions((metadata, isIframe) => {
            this.extensions.push(Object.assign(Object.assign({}, metadata), { available: true, availableInIframe: isIframe }));
        });
    }
    /**
     * Initializes the DAppConnector instance.
     * @param logger - `BaseLogger` for logging purposes (optional).
     */
    async init({ logger } = {}) {
        try {
            this.isInitializing = true;
            if (!this.projectId) {
                throw new Error('Project ID is not defined');
            }
            this.walletConnectClient = await SignClient.init({
                logger,
                relayUrl: 'wss://relay.walletconnect.com',
                projectId: this.projectId,
                metadata: this.dAppMetadata,
            });
            const existingSessions = this.walletConnectClient.session.getAll();
            if (existingSessions.length > 0)
                this.signers = existingSessions.flatMap((session) => this.createSigners(session));
            else
                this.checkIframeConnect();
            this.walletConnectClient.on('session_event', (event) => {
                // Handle session events, such as "chainChanged", "accountsChanged", etc.
                console.log(event);
            });
            this.walletConnectClient.on('session_update', ({ topic, params }) => {
                // Handle session update
                const { namespaces } = params;
                const _session = this.walletConnectClient.session.get(topic);
                // Overwrite the `namespaces` of the existing session with the incoming one.
                const updatedSession = Object.assign(Object.assign({}, _session), { namespaces });
                // Integrate the updated session state into your dapp state.
                console.log(updatedSession);
            });
            this.walletConnectClient.on('session_delete', (pairing) => {
                console.log(pairing);
                this.signers = this.signers.filter((signer) => signer.topic !== pairing.topic);
                this.disconnect(pairing.topic);
                // Session was deleted -> reset the dapp state, clean up from user session, etc.
                console.log('Dapp: Session deleted by wallet!');
            });
            this.walletConnectClient.core.pairing.events.on('pairing_delete', (pairing) => {
                // Session was deleted
                console.log(pairing);
                this.signers = this.signers.filter((signer) => signer.topic !== pairing.topic);
                this.disconnect(pairing.topic);
                console.log(`Dapp: Pairing deleted by wallet!`);
                // clean up after the pairing for `topic` was deleted.
            });
        }
        finally {
            this.isInitializing = false;
        }
    }
    getSigner(accountId) {
        const signer = this.signers.find((signer) => signer.getAccountId().equals(accountId));
        if (!signer)
            throw new Error('Signer is not found for this accountId');
        return signer;
    }
    /**
     * Initiates the WalletConnect connection flow using a QR code.
     * @deprecated Use `openModal` instead.
     * @param pairingTopic - The pairing topic for the connection (optional).
     * @returns A Promise that resolves when the connection process is complete.
     */
    async connectQR(pairingTopic) {
        return this.abortableConnect(async () => {
            try {
                const { uri, approval } = await this.connectURI(pairingTopic);
                if (!uri)
                    throw new Error('URI is not defined');
                QRCodeModal.open(uri, () => {
                    throw new Error('User rejected pairing');
                });
                await this.onSessionConnected(await approval());
            }
            finally {
                QRCodeModal.close();
            }
        });
    }
    /**
     * Initiates the WalletConnect connection flow using a QR code.
     * @param pairingTopic - The pairing topic for the connection (optional).
     * @returns {Promise<SessionTypes.Struct>} - A Promise that resolves when the connection process is complete.
     */
    async openModal(pairingTopic) {
        try {
            const { uri, approval } = await this.connectURI(pairingTopic);
            this.walletConnectModal.openModal({ uri });
            const session = await approval();
            await this.onSessionConnected(session);
            return session;
        }
        finally {
            this.walletConnectModal.closeModal();
        }
    }
    /**
     * Initiates the WallecConnect connection flow using URI.
     * @param pairingTopic - The pairing topic for the connection (optional).
     * @param extensionId - The id for the extension used to connect (optional).
     * @returns A Promise that resolves when the connection process is complete.
     */
    async connect(launchCallback, pairingTopic, extensionId) {
        return this.abortableConnect(async () => {
            var _a;
            const { uri, approval } = await this.connectURI(pairingTopic);
            if (!uri)
                throw new Error('URI is not defined');
            launchCallback(uri);
            const session = await approval();
            if (extensionId) {
                const sessionProperties = Object.assign(Object.assign({}, session.sessionProperties), { extensionId });
                session.sessionProperties = sessionProperties;
                await ((_a = this.walletConnectClient) === null || _a === void 0 ? void 0 : _a.session.update(session.topic, {
                    sessionProperties,
                }));
            }
            await this.onSessionConnected(session);
            return session;
        });
    }
    /**
     * Initiates the WallecConnect connection flow sending a message to the extension.
     * @param extensionId - The id for the extension used to connect.
     * @param pairingTopic - The pairing topic for the connection (optional).
     * @returns A Promise that resolves when the connection process is complete.
     */
    async connectExtension(extensionId, pairingTopic) {
        const extension = this.extensions.find((ext) => ext.id === extensionId);
        if (!extension || !extension.available)
            throw new Error('Extension is not available');
        return this.connect((uri) => {
            extensionConnect(extension.id, extension.availableInIframe, uri);
        }, pairingTopic, extension.availableInIframe ? undefined : extensionId);
    }
    /**
     *  Initiates the WallecConnect connection if the wallet in iframe mode is detected.
     */
    async checkIframeConnect() {
        const extension = this.extensions.find((ext) => ext.availableInIframe);
        if (extension) {
            const session = await this.connectExtension(extension.id);
            if (this.onSessionIframeCreated)
                this.onSessionIframeCreated(session);
        }
    }
    /**
     * Disconnects the current session associated with the specified topic.
     * @param topic - The topic of the session to disconnect.
     * @returns A Promise that resolves when the session is disconnected.
     */
    async disconnect(topic) {
        await this.walletConnectClient.disconnect({
            topic: topic,
            reason: getSdkError('USER_DISCONNECTED'),
        });
    }
    /**
     * Disconnects all active sessions and pairings.
     *
     * Throws error when WalletConnect is not initialized or there are no active sessions/pairings.
     * @returns A Promise that resolves when all active sessions and pairings are disconnected.
     */
    async disconnectAll() {
        if (!this.walletConnectClient) {
            throw new Error('WalletConnect is not initialized');
        }
        const sessions = this.walletConnectClient.session.getAll();
        const pairings = this.walletConnectClient.core.pairing.getPairings();
        if (!(sessions === null || sessions === void 0 ? void 0 : sessions.length) && !(pairings === null || pairings === void 0 ? void 0 : pairings.length)) {
            throw new Error('There is no active session/pairing. Connect to the wallet at first.');
        }
        const disconnectionPromises = [];
        // disconnect sessions
        for (const session of this.walletConnectClient.session.getAll()) {
            console.log(`Disconnecting from session: ${session}`);
            const promise = this.disconnect(session.topic);
            disconnectionPromises.push(promise);
        }
        // disconnect pairings
        //https://docs.walletconnect.com/api/core/pairing
        for (const pairing of pairings) {
            const promise = this.disconnect(pairing.topic);
            disconnectionPromises.push(promise);
        }
        await Promise.all(disconnectionPromises);
        this.signers = [];
    }
    createSigners(session) {
        const allNamespaceAccounts = accountAndLedgerFromSession(session);
        return allNamespaceAccounts.map(({ account, network }) => {
            var _a;
            return new DAppSigner(account, this.walletConnectClient, session.topic, network, (_a = session.sessionProperties) === null || _a === void 0 ? void 0 : _a.extensionId);
        });
    }
    async onSessionConnected(session) {
        this.signers.push(...this.createSigners(session));
    }
    async connectURI(pairingTopic) {
        if (!this.walletConnectClient) {
            throw new Error('WalletConnect is not initialized');
        }
        return this.walletConnectClient.connect({
            pairingTopic,
            requiredNamespaces: networkNamespaces(this.network, this.supportedMethods, this.supportedEvents),
        });
    }
    async request({ method, params, }) {
        const signer = this.signers[this.signers.length - 1];
        if (!signer) {
            throw new Error('There is no active session. Connect to the wallet at first.');
        }
        return await signer.request({
            method: method,
            params: params,
        });
    }
    /**
     * Retrieves the node addresses associated with the current Hedera network.
     *
     * When there is no active session or an error occurs during the request.
     * @returns Promise\<{@link GetNodeAddressesResult}\>
     */
    async getNodeAddresses() {
        return await this.request({
            method: HederaJsonRpcMethod.GetNodeAddresses,
            params: undefined,
        });
    }
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
    async executeTransaction(params) {
        return await this.request({
            method: HederaJsonRpcMethod.ExecuteTransaction,
            params,
        });
    }
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
    async signMessage(params) {
        return await this.request({
            method: HederaJsonRpcMethod.SignMessage,
            params,
        });
    }
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
    async signAndExecuteQuery(params) {
        return await this.request({
            method: HederaJsonRpcMethod.SignAndExecuteQuery,
            params,
        });
    }
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
    async signAndExecuteTransaction(params) {
        return await this.request({
            method: HederaJsonRpcMethod.SignAndExecuteTransaction,
            params,
        });
    }
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
    async signTransaction(params) {
        return await this.request({
            method: HederaJsonRpcMethod.SignTransaction,
            params,
        });
    }
}
export default DAppConnector;
