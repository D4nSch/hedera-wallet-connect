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
import { AccountBalance, AccountId, AccountInfo, LedgerId, SignerSignature, Transaction, TransactionRecord, Client, PublicKey, TransactionId, TransactionResponse, Query, AccountRecordsQuery, AccountInfoQuery, AccountBalanceQuery, TransactionReceiptQuery, TransactionReceipt, TransactionRecordQuery, } from '@hashgraph/sdk';
import { proto } from '@hashgraph/proto';
import { HederaJsonRpcMethod, Uint8ArrayToBase64String, base64StringToSignatureMap, base64StringToUint8Array, ledgerIdToCAIPChainId, queryToBase64String, transactionBodyToBase64String, transactionToBase64String, transactionToTransactionBody, extensionOpen, } from '../shared';
const clients = {};
export class DAppSigner {
    constructor(accountId, signClient, topic, ledgerId = LedgerId.MAINNET, extensionId) {
        this.accountId = accountId;
        this.signClient = signClient;
        this.topic = topic;
        this.ledgerId = ledgerId;
        this.extensionId = extensionId;
    }
    _getHederaClient() {
        const ledgerIdString = this.ledgerId.toString();
        if (!clients[ledgerIdString]) {
            clients[ledgerIdString] = Client.forName(ledgerIdString);
        }
        return clients[ledgerIdString];
    }
    get _signerAccountId() {
        return `${ledgerIdToCAIPChainId(this.ledgerId)}:${this.accountId.toString()}`;
    }
    _getRandomNodes(numberOfNodes) {
        const allNodes = Object.values(this._getHederaClient().network).map((o) => typeof o === 'string' ? AccountId.fromString(o) : o);
        // shuffle nodes
        for (let i = allNodes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allNodes[i], allNodes[j]] = [allNodes[j], allNodes[i]];
        }
        return allNodes.slice(0, numberOfNodes);
    }
    request(request) {
        if (this.extensionId)
            extensionOpen(this.extensionId);
        return this.signClient.request({
            topic: this.topic,
            request,
            chainId: ledgerIdToCAIPChainId(this.ledgerId),
        });
    }
    getAccountId() {
        return this.accountId;
    }
    getAccountKey() {
        throw new Error('Method not implemented.');
    }
    getLedgerId() {
        return this.ledgerId;
    }
    getNetwork() {
        return this._getHederaClient().network;
    }
    getMirrorNetwork() {
        return this._getHederaClient().mirrorNetwork;
    }
    getAccountBalance() {
        return this.call(new AccountBalanceQuery().setAccountId(this.accountId));
    }
    getAccountInfo() {
        return this.call(new AccountInfoQuery().setAccountId(this.accountId));
    }
    getAccountRecords() {
        return this.call(new AccountRecordsQuery().setAccountId(this.accountId));
    }
    async sign(data, signOptions) {
        const { signatureMap } = await this.request({
            method: HederaJsonRpcMethod.SignMessage,
            params: {
                signerAccountId: this._signerAccountId,
                message: Uint8ArrayToBase64String(data[0]),
            },
        });
        const sigmap = base64StringToSignatureMap(signatureMap);
        const signerSignature = new SignerSignature({
            accountId: this.getAccountId(),
            publicKey: PublicKey.fromBytes(sigmap.sigPair[0].pubKeyPrefix),
            signature: sigmap.sigPair[0].ed25519 ||
                sigmap.sigPair[0].ECDSASecp256k1,
        });
        return [signerSignature];
    }
    async checkTransaction(transaction) {
        throw new Error('Method not implemented.');
    }
    async populateTransaction(transaction) {
        return transaction
            .setNodeAccountIds(this._getRandomNodes(10)) // allow retrying on up to 10 nodes
            .setTransactionId(TransactionId.generate(this.getAccountId()));
    }
    /**
     * Prepares a transaction object for signing using a single node account id.
     * If the transaction object does not already have a node account id,
     * generate a random node account id using the Hedera SDK client
     *
     * @param transaction - Any instance of a class that extends `Transaction`
     * @returns transaction - `Transaction` object with signature
     */
    async signTransaction(transaction) {
        let nodeAccountId;
        if (!transaction.nodeAccountIds || transaction.nodeAccountIds.length === 0)
            nodeAccountId = this._getRandomNodes(1)[0];
        else
            nodeAccountId = transaction.nodeAccountIds[0];
        const transactionBody = transactionToTransactionBody(transaction, nodeAccountId);
        const transactionBodyBase64 = transactionBodyToBase64String(transactionBody);
        const { signatureMap } = await this.request({
            method: HederaJsonRpcMethod.SignTransaction,
            params: {
                signerAccountId: this._signerAccountId,
                transactionBody: transactionBodyBase64,
            },
        });
        const sigMap = base64StringToSignatureMap(signatureMap);
        const bodyBytes = base64StringToUint8Array(transactionBodyBase64);
        const bytes = proto.Transaction.encode({ bodyBytes, sigMap }).finish();
        return Transaction.fromBytes(bytes);
    }
    async _tryExecuteTransactionRequest(request) {
        try {
            const transaction = Transaction.fromBytes(request.toBytes());
            const result = await this.request({
                method: HederaJsonRpcMethod.SignAndExecuteTransaction,
                params: {
                    signerAccountId: this._signerAccountId,
                    transactionList: transactionToBase64String(transaction),
                },
            });
            return { result: TransactionResponse.fromJSON(result) };
        }
        catch (error) {
            return { error };
        }
    }
    async _parseQueryResponse(query, base64EncodedQueryResponse) {
        if (query instanceof AccountRecordsQuery) {
            const base64EncodedQueryResponseSplit = base64EncodedQueryResponse.split(',');
            const data = base64EncodedQueryResponseSplit.map((o) => base64StringToUint8Array(o));
            return data.map((o) => TransactionRecord.fromBytes(o));
        }
        const data = base64StringToUint8Array(base64EncodedQueryResponse);
        if (query instanceof AccountBalanceQuery) {
            return AccountBalance.fromBytes(data);
        }
        else if (query instanceof AccountInfoQuery) {
            return AccountInfo.fromBytes(data);
        }
        else if (query instanceof TransactionReceiptQuery) {
            return TransactionReceipt.fromBytes(data);
        }
        else if (query instanceof TransactionRecordQuery) {
            return TransactionRecord.fromBytes(data);
        }
        else {
            throw new Error('Unsupported query type');
        }
    }
    async _tryExecuteQueryRequest(request) {
        try {
            const query = Query.fromBytes(request.toBytes());
            const result = await this.request({
                method: HederaJsonRpcMethod.SignAndExecuteQuery,
                params: {
                    signerAccountId: this._signerAccountId,
                    query: queryToBase64String(query),
                },
            });
            return { result: this._parseQueryResponse(query, result.response) };
        }
        catch (error) {
            return { error };
        }
    }
    async call(request) {
        var _a, _b, _c, _d, _e, _f;
        const txResult = await this._tryExecuteTransactionRequest(request);
        if (txResult.result) {
            return txResult.result;
        }
        const queryResult = await this._tryExecuteQueryRequest(request);
        if (queryResult.result) {
            return queryResult.result;
        }
        // TODO: make this error more usable
        throw new Error('Error executing transaction or query: \n' +
            JSON.stringify({
                txError: {
                    name: (_a = txResult.error) === null || _a === void 0 ? void 0 : _a.name,
                    message: (_b = txResult.error) === null || _b === void 0 ? void 0 : _b.message,
                    stack: (_c = txResult.error) === null || _c === void 0 ? void 0 : _c.stack,
                },
                queryError: {
                    name: (_d = queryResult.error) === null || _d === void 0 ? void 0 : _d.name,
                    message: (_e = queryResult.error) === null || _e === void 0 ? void 0 : _e.message,
                    stack: (_f = queryResult.error) === null || _f === void 0 ? void 0 : _f.stack,
                },
            }, null, 2));
    }
}
