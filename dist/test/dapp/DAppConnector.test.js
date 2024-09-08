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
import { AccountId, AccountInfoQuery, LedgerId, TopicCreateTransaction } from '@hashgraph/sdk';
import { DAppConnector, HederaJsonRpcMethod, HederaSessionEvent, queryToBase64String, transactionToBase64String, transactionToTransactionBody, transactionBodyToBase64String, } from '../../src';
import { projectId, dAppMetadata, useJsonFixture, prepareTestTransaction, testUserAccountId, } from '../_helpers';
import Client from '@walletconnect/sign-client';
describe('DAppConnector', () => {
    let connector;
    const fakeSession = useJsonFixture('fakeSession');
    beforeEach(() => {
        connector = new DAppConnector(dAppMetadata, LedgerId.TESTNET, projectId);
    });
    afterEach(() => {
        global.gc && global.gc();
    });
    describe('constructor', () => {
        it('should create a valid class object', () => {
            const methods = ['hedera_testMethod', 'any_testMethod'];
            const events = [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged];
            connector = new DAppConnector(dAppMetadata, LedgerId.TESTNET, projectId, methods, events);
            expect(connector.dAppMetadata).toBe(dAppMetadata);
            expect(connector.network).toBe(LedgerId.TESTNET);
            expect(connector.projectId).toBe(projectId);
            expect(connector.supportedMethods).toEqual(methods);
            expect(connector.supportedEvents).toEqual(events);
        });
        it('should create a valid class object without passing of methods and events', () => {
            connector = new DAppConnector(dAppMetadata, LedgerId.TESTNET, projectId);
            expect(connector.dAppMetadata).toBe(dAppMetadata);
            expect(connector.network).toBe(LedgerId.TESTNET);
            expect(connector.projectId).toBe(projectId);
            expect(connector.supportedMethods).toEqual(Object.values(HederaJsonRpcMethod));
            expect(connector.supportedEvents).toEqual([]);
        });
    });
    describe('init', () => {
        it('should init SignClient correctly', async () => {
            var _a, _b, _c;
            await connector.init({ logger: 'error' });
            expect(connector.walletConnectClient).toBeInstanceOf(Client);
            expect((_a = connector.walletConnectClient) === null || _a === void 0 ? void 0 : _a.metadata).toBe(dAppMetadata);
            expect((_b = connector.walletConnectClient) === null || _b === void 0 ? void 0 : _b.core.projectId).toBe(projectId);
            expect((_c = connector.walletConnectClient) === null || _c === void 0 ? void 0 : _c.core.relayUrl).toBe('wss://relay.walletconnect.com');
        });
        it('should create signers if there are a persisted sessions', async () => {
            const checkPersistedStateSpy = jest.spyOn(connector, 'checkPersistedState');
            checkPersistedStateSpy.mockReturnValue([fakeSession]);
            await connector.init({ logger: 'error' });
            expect(checkPersistedStateSpy).toHaveBeenCalled();
            expect(connector.signers[0].getAccountId().toString()).toBe(fakeSession.namespaces.hedera.accounts[0].split(':')[2]);
            expect(connector.signers[0].topic).toBe(fakeSession.topic);
            expect(connector.signers[0].getLedgerId()).toBe(LedgerId.TESTNET);
            checkPersistedStateSpy.mockRestore();
        });
    });
    describe('disconnect', () => {
        beforeEach(async () => {
            const checkPersistedStateSpy = jest.spyOn(connector, 'checkPersistedState');
            checkPersistedStateSpy.mockReturnValue([fakeSession]);
            await connector.init({ logger: 'error' });
            checkPersistedStateSpy.mockRestore();
        });
        it('should disconnect Client from topic', async () => {
            const walletConnectDisconnectSpy = jest.spyOn(connector.walletConnectClient, 'disconnect');
            walletConnectDisconnectSpy.mockImplementation(async () => { });
            connector.disconnect(fakeSession.topic);
            expect(walletConnectDisconnectSpy).toHaveBeenCalled();
            expect(walletConnectDisconnectSpy).toHaveBeenCalledTimes(1);
            expect(walletConnectDisconnectSpy).toHaveBeenCalledWith(expect.objectContaining({ topic: fakeSession.topic }));
            walletConnectDisconnectSpy.mockRestore();
        });
    });
    describe('requests', () => {
        let lastSignerRequestMock;
        beforeEach(async () => {
            const checkPersistedStateSpy = jest.spyOn(connector, 'checkPersistedState');
            checkPersistedStateSpy.mockReturnValue([fakeSession]);
            await connector.init({ logger: 'error' });
            checkPersistedStateSpy.mockRestore();
            lastSignerRequestMock = jest.spyOn(connector.signers[0], 'request');
            lastSignerRequestMock.mockImplementation(() => { });
        });
        afterEach(() => {
            lastSignerRequestMock.mockRestore();
        });
        // 1
        describe(DAppConnector.prototype.getNodeAddresses, () => {
            it('should throw an error if there is no any signer', async () => {
                connector.signers = [];
                await expect(connector.getNodeAddresses()).rejects.toThrow('There is no active session. Connect to the wallet at first.');
            });
            it('should invoke last signer request with correct params', async () => {
                await connector.getNodeAddresses();
                expect(lastSignerRequestMock).toHaveBeenCalled();
                expect(lastSignerRequestMock).toHaveBeenCalledTimes(1);
                expect(lastSignerRequestMock).toHaveBeenCalledWith({
                    method: HederaJsonRpcMethod.GetNodeAddresses,
                    params: undefined,
                });
            });
        });
        // 2
        describe(DAppConnector.prototype.executeTransaction, () => {
            const transaction = prepareTestTransaction(new TopicCreateTransaction(), { freeze: true });
            const params = {
                transactionList: transactionToBase64String(transaction),
            };
            it('should throw an error if there is no any signer', async () => {
                connector.signers = [];
                await expect(connector.executeTransaction(params)).rejects.toThrow('There is no active session. Connect to the wallet at first.');
            });
            it('should invoke last signer request with correct params', async () => {
                await connector.executeTransaction(params);
                expect(lastSignerRequestMock).toHaveBeenCalled();
                expect(lastSignerRequestMock).toHaveBeenCalledTimes(1);
                expect(lastSignerRequestMock).toHaveBeenCalledWith({
                    method: HederaJsonRpcMethod.ExecuteTransaction,
                    params,
                });
            });
        });
        // 3
        describe(DAppConnector.prototype.signMessage, () => {
            const params = {
                message: 'test message',
                signerAccountId: testUserAccountId.toString(),
            };
            it('should throw an error if there is no any signer', async () => {
                connector.signers = [];
                await expect(connector.signMessage(params)).rejects.toThrow('There is no active session. Connect to the wallet at first.');
            });
            it('should invoke last signer request with correct params', async () => {
                await connector.signMessage(params);
                expect(lastSignerRequestMock).toHaveBeenCalled();
                expect(lastSignerRequestMock).toHaveBeenCalledTimes(1);
                expect(lastSignerRequestMock).toHaveBeenCalledWith({
                    method: HederaJsonRpcMethod.SignMessage,
                    params,
                });
            });
        });
        // 4
        describe(DAppConnector.prototype.signAndExecuteQuery, () => {
            const query = new AccountInfoQuery().setAccountId(testUserAccountId.toString());
            const params = {
                signerAccountId: testUserAccountId.toString(),
                query: queryToBase64String(query),
            };
            it('should throw an error if there is no any signer', async () => {
                connector.signers = [];
                await expect(connector.signAndExecuteQuery(params)).rejects.toThrow('There is no active session. Connect to the wallet at first.');
            });
            it('should invoke last signer request with correct params', async () => {
                await connector.signAndExecuteQuery(params);
                expect(lastSignerRequestMock).toHaveBeenCalled();
                expect(lastSignerRequestMock).toHaveBeenCalledTimes(1);
                expect(lastSignerRequestMock).toHaveBeenCalledWith({
                    method: HederaJsonRpcMethod.SignAndExecuteQuery,
                    params,
                });
            });
        });
        // 5
        describe(DAppConnector.prototype.signAndExecuteTransaction, () => {
            const transaction = prepareTestTransaction(new TopicCreateTransaction(), { freeze: true });
            const params = {
                signerAccountId: testUserAccountId.toString(),
                transactionList: transactionToBase64String(transaction),
            };
            it('should throw an error if there is no any signer', async () => {
                connector.signers = [];
                await expect(connector.signAndExecuteTransaction(params)).rejects.toThrow('There is no active session. Connect to the wallet at first.');
            });
            it('should invoke last signer request with correct params', async () => {
                await connector.signAndExecuteTransaction(params);
                expect(lastSignerRequestMock).toHaveBeenCalled();
                expect(lastSignerRequestMock).toHaveBeenCalledTimes(1);
                expect(lastSignerRequestMock).toHaveBeenCalledWith({
                    method: HederaJsonRpcMethod.SignAndExecuteTransaction,
                    params,
                });
            });
        });
        // 6
        describe(DAppConnector.prototype.signTransaction, () => {
            const transaction = prepareTestTransaction(new TopicCreateTransaction(), { freeze: true });
            const params = {
                signerAccountId: testUserAccountId.toString(),
                transactionBody: transactionBodyToBase64String(
                // must specify a node account id for the transaction body
                transactionToTransactionBody(transaction, AccountId.fromString('0.0.3'))),
            };
            it('should throw an error if there is no any signer', async () => {
                connector.signers = [];
                await expect(connector.signTransaction(params)).rejects.toThrow('There is no active session. Connect to the wallet at first.');
            });
            it('should invoke last signer request with correct params', async () => {
                await connector.signTransaction(params);
                expect(lastSignerRequestMock).toHaveBeenCalled();
                expect(lastSignerRequestMock).toHaveBeenCalledTimes(1);
                expect(lastSignerRequestMock).toHaveBeenCalledWith({
                    method: HederaJsonRpcMethod.SignTransaction,
                    params,
                });
            });
        });
    });
    // describe('connect', () => {
    //   it('should establish connection and create session', async () => {
    //     connector = new DAppConnector(appMetadata, LedgerId.TESTNET, PROJECT_ID)
    //     await connector.init()
    //     expect(connector.walletConnectClient).not.toBeNull()
    //     await connector.connect((pairing) => {
    //       console.log('PairingString: ', pairing)
    //     })
    //     expect(connector.walletConnectClient?.session.getAll()).toHaveLength(1)
    //   }, 60_000)
    // })
});
