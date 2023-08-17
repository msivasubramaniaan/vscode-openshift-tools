/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import { V220Devfile, V220DevfileCommandsItemsExecGroup } from '@devfile/api';
import { KubeConfig } from '@kubernetes/client-node';
import { fail } from 'assert';
import { assert, expect } from 'chai';
import { ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as tmp from 'tmp';
import { promisify } from 'util';
import { EventEmitter, Terminal, window, workspace } from 'vscode';
import * as YAML from 'yaml';
import { CommandText } from '../../src/base/command';
import { CliChannel } from '../../src/cli';
import { getInstance } from '../../src/odo';
import { Command } from '../../src/odo/command';
import { ComponentDescription } from '../../src/odo/componentTypeDescription';

const ODO = getInstance();
const kc = new KubeConfig();

const newProjectName = `project${Math.round(Math.random() * 1000)}`;

// tests are assuming your current context is already pointing to test cluster on which you can create and delete namespaces
suite('odo commands integration', function () {

    const isOpenShift = process.env.IS_OPENSHIFT || false;
    const clusterUrl = process.env.CLUSTER_URL || 'https://api.crc.testing:6443';
    const username = process.env.CLUSTER_USER || 'developer';
    const password = process.env.CLUSTER_PASSWORD || 'developer';

    suiteSetup(async function() {
        if (isOpenShift) {
            try {
                await ODO.execute(Command.odoLogout());
            } catch (e) {
                // do nothing
            }
            await ODO.execute(
                Command.odoLoginWithUsernamePassword(
                    clusterUrl,
                    username,
                    password,
                ),
            );
        }
        kc.loadFromDefault();
    });

    suite('login/logout', function() {
        let token: string;

        suiteSetup(async function() {
            if (isOpenShift) {
                // get current user token and logout
                await ODO.execute(Command.odoLoginWithUsernamePassword(clusterUrl, username, password));
                token = (await ODO.execute(Command.getCurrentUserToken())).stdout;
                await ODO.execute(Command.odoLogout());
            } else {
                this.skip();
            }
        });

        suiteTeardown(async function() {
            // log back in for the rest of the tests
            if (isOpenShift) {
                await ODO.execute(Command.odoLoginWithUsernamePassword(clusterUrl, username, password));
            }
        });

        teardown(async function() {
            await ODO.execute(Command.odoLogout());
        });

        test('odoLogout()', async function() {
            try {
                await ODO.execute(Command.getCurrentUserName())
                expect.fail('should be unable to get current user, since you are logged out');
            } catch (_e) {
                // do nothing
            }
        });

        test('odoLoginWithUsernamePassword()', async function () {
            await ODO.execute(
                Command.odoLoginWithUsernamePassword(
                    clusterUrl,
                    username,
                    password,
                ),
            );
            const currentUserData = await ODO.execute(Command.getCurrentUserName());
            expect(currentUserData.stdout).to.equal(username);
        });

        test('odoLoginWithToken()', async function() {
            await ODO.execute(Command.odoLoginWithToken(clusterUrl, token));
            const currentUserData = await ODO.execute(Command.getCurrentUserName());
            expect(currentUserData.stdout).to.equal(username);
        });

    });

    test('showServerUrl()', async function() {
        const cliData = await ODO.execute(Command.showServerUrl());
        expect(cliData.stdout).to.equal(clusterUrl);
    });

    test('getCurrentUserName()', async function() {
        if (isOpenShift) {
            const cliData = await ODO.execute(Command.getCurrentUserName());
            expect(cliData.stdout).to.contain(username);
        } else {
            this.skip();
        }
    });

    test('getCurrentUserToken()', async function() {
        if (isOpenShift) {
            await ODO.execute(Command.getCurrentUserToken());
        } else {
            this.skip();
        }
    });

    suite('project-related commands', function() {

        suiteSetup(async function() {
            // createProject()
            await ODO.execute(Command.createProject(newProjectName));
        });

        suiteTeardown(async function() {
            // deleteProject()
            await ODO.execute(Command.deleteProject(newProjectName));
        });

        test('listProjects()', function () {
            return ODO.execute(Command.listProjects());
        });

        test('getDeployments()', async function () {
            await ODO.execute(Command.getDeployments(newProjectName));
        });

        test('setNamespace()', async function() {
            await ODO.execute(Command.setNamespace(newProjectName));
        });

    });

    test('listRegistries()', async function () {
        return ODO.execute(Command.listRegistries());
    });

    test('addRegistry()', async function() {
        await ODO.execute(Command.addRegistry('CheRegistry', 'https://example.org', undefined));
    });

    test('removeRegistry()', async function() {
        await ODO.execute(Command.removeRegistry('CheRegistry'));
    });

    test('listCatalogComponentsJson()', async function () {
        await ODO.execute(Command.listCatalogComponentsJson());
    });

    test('printOcVersion()', async function () {
        await ODO.execute(Command.printOcVersion());
    });

    test('printOcVersionJson()', async function() {
        await ODO.execute(Command.printOcVersionJson());
    });

    test('printOdoVersion()', async function () {
        await ODO.execute(Command.printOdoVersion());
    });

    test('showServerUrl()', async function () {
        await ODO.execute(Command.showServerUrl());
    });

    test('showConsoleUrl()', async function () {
        if (isOpenShift) {
            const canI = await ODO.execute(
                new CommandText('oc auth can-i get configmap --namespace openshift-config-managed'),
                undefined,
                false,
            ).then((result) => {
                return !result.stdout.startsWith('no');
            });
            if (!canI) {
                this.skip();
            } else {
                await ODO.execute(Command.showConsoleUrl());
            }
        } else {
            this.skip();
        }
    });

    test('describeCatalogComponent()', async function () {
        const types = await ODO.getComponentTypes();
        const devfileCompType = types[0];
        if (!devfileCompType) {
            this.skip();
        } else {
            await ODO.execute(
                Command.describeCatalogComponent(
                    devfileCompType.name,
                    devfileCompType.registryName,
                ),
            );
        }
    });

    test('setOpenShiftContext', async function () {
        await ODO.execute(Command.setOpenshiftContext(kc.currentContext));
    });

    test('getBindableServices()', async function() {
        const result = await ODO.execute(Command.getBindableServices());
        expect(result.stdout.trim()).to.equal('{}');
    });

    test.skip('deletePreviouslyPushedResources()');
    test.skip('listCatalogOperatorBackedServices()');
    test.skip('addHelmRepo()');
    test.skip('updateHelmRepo()');
    test.skip('installHelmChart()');
    test.skip('unInstallHelmChart()');
    test.skip('deleteComponentNoContext()');
    test.skip('deleteContext()');
    test.skip('deleteCluster()');
    test.skip('deleteUser()');
    test.skip('getClusterServiceVersionJson()');

    suite('services', function() {

        const serviceName = 'my-test-service';
        const projectName = 'my-test-service-project1';

        // taken from https://docs.openshift.com/container-platform/3.11/dev_guide/deployments/kubernetes_deployments.html
        const serviceFileYaml = //
            'apiVersion: apps/v1\n' + //
            'kind: Deployment\n' + //
            'metadata:\n' + //
            `  name: ${serviceName}\n` + //
            'spec:\n' + //
            '  replicas: 1\n' + //
            '  selector:\n' + //
            '    matchLabels:\n' + //
            '      app: hello-openshift\n' + //
            '  template:\n' + //
            '    metadata:\n' + //
            '      labels:\n' + //
            '        app: hello-openshift\n' + //
            '    spec:\n' + //
            '      containers:\n' + //
            '      - name: hello-openshift\n' + //
            '        image: openshift/hello-openshift:latest\n' + //
            '        ports:\n' + //
            '        - containerPort: 80\n';

        let serviceFile: string;

        suiteSetup(async function () {
            serviceFile = await promisify(tmp.file)();
            await fs.writeFile(serviceFile, serviceFileYaml);
            if (isOpenShift) {
                await ODO.execute(Command.odoLoginWithUsernamePassword(clusterUrl, username, password));
            }
            try {
                await ODO.execute(Command.createProject(projectName));
            } catch (e) {
                // do nothing, it probably already exists
            }
            await ODO.execute(Command.setNamespace(projectName));
        });

        suiteTeardown(async function() {
            await ODO.execute(new CommandText(`oc delete deployment ${serviceName} --namespace ${projectName}  --force=true`));
            await fs.rm(serviceFile);
            // this call fails to exit on kind/minikube during integration tests
            void ODO.deleteProject(projectName);
        });

        test('ocCreate()', async function() {
            await ODO.execute(Command.ocCreate(serviceFile));
        });

    });

    suite('component', function() {
        const componentName = 'my-test-component';
        const componentType = 'go';
        const componentStarterProject = 'go-starter';
        let componentLocation: string;

        suiteSetup(async function () {
            await ODO.execute(Command.createProject(newProjectName));
            await ODO.execute(Command.setNamespace(newProjectName));
            componentLocation = await promisify(tmp.dir)();
            if (isOpenShift) {
                await ODO.execute(Command.odoLoginWithUsernamePassword(clusterUrl, username, password));
            }
        });

        suiteTeardown(async function () {
            let toRemove = -1;
            for (let i = 0; i < workspace.workspaceFolders.length; i++) {
                if (workspace.workspaceFolders[i].uri.fsPath === componentLocation) {
                    toRemove = i;
                    break;
                }
            }
            if (toRemove !== -1) {
                workspace.updateWorkspaceFolders(toRemove, 1);
            }
            await fs.rm(componentLocation, { recursive: true, force: true });
            await ODO.execute(Command.deleteProject(newProjectName));
        });

        test('createLocalComponent()', async function () {
            await ODO.execute(
                Command.createLocalComponent(
                    componentType,
                    'DefaultDevfileRegistry',
                    componentName,
                    componentStarterProject,
                    undefined,
                    undefined,
                    '2.0.0'
                ),
                componentLocation
            );
            await fs.access(path.join(componentLocation, 'devfile.yaml'));
        });

        test('listComponents()', async function () {
            await ODO.execute(Command.listComponents(newProjectName));
        });

        test('describeComponent()', async function() {
            const res = await ODO.execute(Command.describeComponent(), componentLocation);
            expect(res.stdout).contains(componentName);
            expect(res.stdout).contains('Go');
        });

        test('describeComponentJson()', async function () {
            const res = await ODO.execute(Command.describeComponentJson(), componentLocation);
            expect(res.stdout).contains(componentName);
            expect(res.stdout).contains(componentType);
        });

        test('analyze()', async function() {
            const res = await ODO.execute(Command.analyze(), componentLocation);
            const resObj = JSON.parse(res.stdout);
            expect(resObj[0]?.name).to.equal(path.basename(componentLocation).toLocaleLowerCase());
            expect(resObj[0]?.devfile).to.equal(componentType);
        });

        suite('deploying', function() {
            // FIXME: Deploy depends on pushing container images to a registry.
            // The default registry it tries to push to is docker.
            // We shouldn't try to push to Docker Hub from these tests.
            // OpenShift comes with a registry built in to the cluster,
            // and there is a way to set this registry as the one that
            // odo pushes to during deploy.
            // However, you need cluster-admin access in order to expose
            // the registry outside of the cluster and figure out its address.
            test('deploy(): PENDING');
            test('undeploy(): PENDING');
        });

        test('dev()', async function() {
            const outputEmitter = new EventEmitter<string>();
            let devProcess: ChildProcess;
            function failListener(_error) {
                assert.fail('odo dev errored before it was closed');
            }
            const term = window.createTerminal({
                name: 'test terminal',
                pty: {
                    open: () => {
                        void CliChannel.getInstance().spawnTool(Command.dev(false)) //
                            .then(childProcess => {
                                devProcess = childProcess
                                devProcess.on('error', failListener);
                            });
                    },
                    close: () => {
                        if (devProcess) {
                            devProcess.removeListener('error', failListener);
                            devProcess.kill('SIGINT');
                        }
                    },
                    handleInput: (data: string) => {
                        if (data.length) {
                            if (devProcess) {
                                devProcess.removeListener('error', failListener);
                                devProcess.kill('SIGINT');
                            }
                        }
                    },
                    onDidWrite: outputEmitter.event
                }
            });
            await new Promise<void>(resolve => setTimeout(resolve, 3000));
            // we instruct the pseudo terminal to close the dev session when any text is sent
            term.sendText('a');
            term.dispose();
        });

        test('showLog()', async function () {
            await ODO.execute(Command.showLog(), componentLocation);
        });

        test('showLogAndFollow()', async function() {
            const outputEmitter = new EventEmitter<string>();
            let devProcess: ChildProcess;
            function failListener(_error) {
                assert.fail('showLogAndFollow() errored before it was closed');
            }
            const term = window.createTerminal({
                name: 'test terminal',
                pty: {
                    open: () => {
                        void CliChannel.getInstance().spawnTool(Command.showLogAndFollow()) //
                            .then(childProcess => {
                                devProcess = childProcess
                                devProcess.on('error', failListener);
                            });
                    },
                    close: () => {
                        if (devProcess) {
                            devProcess.removeListener('error', failListener);
                            devProcess.kill('SIGINT');
                        }
                    },
                    handleInput: (data: string) => {
                        if (data.length) {
                            if (devProcess) {
                                devProcess.removeListener('error', failListener);
                                devProcess.kill('SIGINT');
                            }
                        }
                    },
                    onDidWrite: outputEmitter.event
                }
            });
            await new Promise<void>(resolve => setTimeout(resolve, 1000));
            // we instruct the pseudo terminal to close the dev session when any text is sent
            term.sendText('a');
            term.dispose();
        });

        test('addBinding()', async function() {
            const result = await ODO.execute(Command.addBinding('default', 'myservice', 'myservice-binding'), componentLocation, false);
            expect(result.stderr).to.contain('No bindable service instances found in namespace "default"');
        });

        test('deleteComponentConfiguration', async function() {
            await ODO.execute(Command.deleteComponentConfiguration(), componentLocation);
            try {
                await fs.access(path.join(componentLocation, 'devfile.yaml'));
                this.fail();
            } catch (_ignored) {
                // do nothing
            }
        });
    });

    suite('component dev', function() {
        const componentName = 'my-test-component';
        const componentType = 'nodejs';
        const componentStarterProject = 'nodejs-starter';
        let componentLocation: string;

        suiteSetup(async function () {
            if (isOpenShift) {
                await ODO.execute(
                    Command.odoLoginWithUsernamePassword(clusterUrl, username, password),
                );
            }
            await ODO.execute(Command.createProject(newProjectName));
            await ODO.execute(Command.setNamespace(newProjectName));
            componentLocation = await promisify(tmp.dir)();
        });

        suiteTeardown(async function () {
            let toRemove = -1;
            for (let i = 0; i < workspace.workspaceFolders.length; i++) {
                if (workspace.workspaceFolders[i].uri.fsPath === componentLocation) {
                    toRemove = i;
                    break;
                }
            }
            if (toRemove !== -1) {
                workspace.updateWorkspaceFolders(toRemove, 1);
            }
            await fs.rm(componentLocation, { recursive: true, force: true });
            await ODO.execute(Command.deleteProject(newProjectName));
        });

        interface TerminalListener {
            onOutput(data: string): void;
            onError(data:string): void;
        }

        function executeCommandInTerminal(commandText: CommandText, cwd: string, listener?: TerminalListener) : Terminal {
            const outputEmitter = new EventEmitter<string>();
            outputEmitter.event(data => {
                if (listener) listener.onOutput(data);
            });
            let devProcess: ChildProcess;
            function failListener(_error) {
                assert.fail('odo dev errored before it was closed');
            }
            return window.createTerminal({
                name: 'test terminal',
                pty: {
                    open: () => {
                        void CliChannel.getInstance().spawnTool(Command.dev(true),
                            {
                                cwd
                            })
                            .then(childProcess => {
                                devProcess = childProcess
                                devProcess.on('error', failListener);
                                devProcess.stdout.on('data', data => {
                                    if (listener) listener.onOutput(data);
                                });
                                devProcess.stderr.on('data', data => {
                                    if (listener) listener.onError(data);
                                });
                            });
                    },
                    close: () => {
                        if (devProcess) {
                            devProcess.removeListener('error', failListener);
                            devProcess.kill('SIGINT');
                        }
                    },
                    handleInput: (data: string) => {
                        // Close terminal on any input
                        if (data.length) {
                            if (devProcess) {
                                devProcess.removeListener('error', failListener);
                                devProcess.kill('SIGINT');
                            }
                        }
                    },
                    onDidWrite: outputEmitter.event
                }
            });
        }

        async function startDevInTerminal(cwd?) : Promise<Terminal> {
            let termOutput = '';
            let termError = '';
            const term = executeCommandInTerminal(Command.dev(true), cwd, {
                onOutput(data) {
                    termOutput = termOutput.concat(data);
                },
                onError(data) {
                    termError = termError.concat(data);
                }
            });

            let hopesLeft = 30;
            let devIsRunning = false;
            do {
                hopesLeft--;
                await new Promise<void>(resolve => setTimeout(resolve, 2000));
                let index = termOutput.indexOf(`Developing using the "${componentName}" Devfile`);
                if (index >= 0) index = termOutput.indexOf('✓  Pod is Running', index);
                if (index >= 0) index = termOutput.indexOf('↪ Dev mode', index);
                devIsRunning = (index >= 0);
            } while (hopesLeft > 0 && !devIsRunning);
            if (!devIsRunning) {
                if (termError.trim().length > 0) {
                    fail(`Start Dev failed: ${termError}`);
                }
                fail('Waiting for pod to start is timed out');
            }
            return term;
        }

        const helloWorldCommandId = 'hello-world';
        const helloWorldCommandOutput = 'Hello, World!';
        const helloWorldCommandExecCommandLine = `echo "${helloWorldCommandOutput}"`;

        async function runComponentCommandInTerminal(commandId: string, cwd?) : Promise<Terminal> {
            let termOutput = '';
            let termError = '';
            const term = executeCommandInTerminal(Command.runComponentCommand(commandId), cwd, {
                onOutput(data) {
                    termOutput = termOutput.concat(data);
                },
                onError(data) {
                    termError = termError.concat(data);
                }
            });

            let hopesLeft = 30;
            let commandIdRunning = false;
            do {
                hopesLeft--;
                await new Promise<void>(resolve => setTimeout(resolve, 2000));
                commandIdRunning = termOutput.indexOf(helloWorldCommandOutput) >= -1;
            } while (hopesLeft > 0 && !commandIdRunning);
            if (!commandIdRunning) {
                if (termError.trim().length > 0) {
                    fail(`Run Component Command failed: ${termError}`);
                }
                fail('Waiting for command to start executing is timed out');
            }
            return term;
        }

        async function fixupDevFile(devfilePath: string): Promise<void> {
            // Parse YAML into an Object, add:
            //
            // - exec:
            //     group:
            //       kind: run
            //     commandLine: echo "Hello, World!"
            //     component: runtime
            //   id: hello-world
            //
            // and then save into the same debfile.yaml
            const file = await fs.readFile(devfilePath, 'utf8');
            const devfile: V220Devfile = YAML.parse(file.toString());
            if (!devfile || !devfile.commands) {
                fail(`DevFile '${devfilePath}' cannot be read`);
            }
            const devfileCommands = devfile.commands;
            let helloWorldCommand;
            for (let i = 0; i < devfileCommands.length; i++) {
                if(devfileCommands[i].id === helloWorldCommandId) {
                    helloWorldCommand = devfileCommands[i];
                    break;
                }
            }
            if (helloWorldCommand) {
                helloWorldCommand.exec = {
                    group:{
                        kind: V220DevfileCommandsItemsExecGroup.KindEnum.Run
                    },
                    commandLine: helloWorldCommandExecCommandLine,
                    component: 'runtime'
                }
            } else {
                devfileCommands.push({
                    exec: {
                        group:{
                            kind: V220DevfileCommandsItemsExecGroup.KindEnum.Run
                        },
                        commandLine: helloWorldCommandExecCommandLine,
                        component: 'runtime'
                    },
                    id: helloWorldCommandId
                })
            }
            await fs.writeFile(devfilePath, YAML.stringify(devfile), 'utf8');
        }

        test('runComponentCommand()', async function () {
             await ODO.execute(
                Command.createLocalComponent(
                    componentType,
                    'DefaultDevfileRegistry',
                    componentName,
                    componentStarterProject,
                    undefined,
                    undefined,
                    '2.1.1'
                ),
                componentLocation
            );
            const devfilePath = path.join(componentLocation, 'devfile.yaml')
            await fs.access(devfilePath);

            fixupDevFile(devfilePath);

            const describeCmdResult = await ODO.execute(Command.describeComponentJson(), componentLocation);
            const componentDescription = JSON.parse(describeCmdResult.stdout) as ComponentDescription;
            expect(componentDescription.devfileData.devfile.commands[0]?.id).exist;

            const commands = componentDescription.devfileData.devfile.commands
            let helloCommand: Command;
            for (let i = 0; i < commands.length; i++) {
                if (commands[i].id && helloWorldCommandId === commands[i].id) {
                    helloCommand = commands[i];
                    break;
                }
            }
            if (!helloCommand) {
                fail(`Command '${helloWorldCommandId}' doesn't exist in Component '${componentName}'`);
            }

            let devTerm : Terminal;
            let runCommandTerm : Terminal;
            try {
                devTerm = await startDevInTerminal(componentLocation);
                runCommandTerm = await runComponentCommandInTerminal(helloWorldCommandId, componentLocation);
            } finally {
                // we instruct the pseudo terminals to close the dev session when any text is sent
                if (runCommandTerm) {
                    runCommandTerm.sendText('exit');
                    runCommandTerm.dispose();
                }
                if (devTerm) {
                    devTerm.sendText('exit');
                    devTerm.dispose();
                }
            }
        });
    });
});
