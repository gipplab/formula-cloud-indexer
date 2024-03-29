"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const error_1 = require("tslint/lib/error");
/* tslint:disable-next-line  */
const BB = require('bluebird');
/* tslint:disable-next-line  */
const fs = BB.promisifyAll(require('fs'));
/* tslint:disable-next-line  */
const PQueue = require('p-queue');
/* tslint:disable-next-line  */
const cp = require('child_process');
const processes = [];
const pool = [];
let converted = 0;
const getProcess = () => {
    if (pool.length) {
        // @ts-ignore
        const p = pool.pop();
        /* tslint:disable-next-line  */
        console.log(`Receiving worker ${p.pid} from pool. Pool size ${pool.length}.`);
        return p;
    }
    else {
        const p = cp.fork(path.join(__dirname, 'worker.js'));
        processes.push(p);
        /* tslint:disable-next-line  */
        console.log(`Started new worker ${p.pid}. Total workers ${processes.length}.`);
        p.on('message', () => {
            /* tslint:disable-next-line  */
            console.log(`Giving back worker ${p.pid} to pool. Pool size ${pool.length}.`);
            pool.push(p);
        });
        return p;
    }
};
const terminateSubProcesses = () => {
    /* tslint:disable-next-line  */
    console.log('Shutdown workers.');
    processes.forEach(p => p.disconnect());
};
const RemoteProcessFile = (inFile, outFile) => {
    return new Promise((resolve) => {
        const p = getProcess();
        p.send({ inFile, outFile });
        function onMessage() {
            converted++;
            /* tslint:disable-next-line  */
            console.log(`Converted ${converted} files. Last file was ${inFile}.`);
            p.removeListener('message', onMessage);
            resolve();
        }
        p.on('message', onMessage);
    });
};
const ProcessFolder = (inFolder, outFolder, queue = new PQueue({
    concurrency: 60,
})) => {
    if (!fs.existsSync(outFolder)) {
        fs.mkdirSync(outFolder);
    }
    return fs.readdirAsync(inFolder)
        .map((fn) => queue.add(() => {
            const stats = fs.statSync(path.join(inFolder, fn));
            if (stats.isFile()) {
                if (path.extname(fn) === '.ann') {
                    const inFile = path.join(inFolder, fn);
                    const outFile = path.join(outFolder, fn);
                    const fileP = RemoteProcessFile(inFile, outFile);
                    /* tslint:disable-next-line  */
                    return fileP.then(() => console.log(`Remaining: ${queue.pending}`));
                }
            }
            else if (stats.isDirectory()) {
                throw new error_1.Error('not supported');
            }
            /* tslint:disable-next-line  */
            console.log(`Conversion que length ${queue.pending}`);
        })).then(() => {
            terminateSubProcesses();
            return queue.onIdle();
        });
};
if (process.argv.length === 4) {
    /* tslint:disable-next-line  */
    ProcessFolder(process.argv[2], process.argv[3]).then(() => console.log('All done'));
}



"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const converter_1 = require("./converter");
/* tslint:disable-next-line  */
const log = (msg) => console.log(`Worker ${process.pid}: ${msg}`);
process.on('message', (msg) => {
    log(`Receiving file ${msg.inFile}.`);
    converter_1.ProcessFile(msg.inFile, msg.outFile).then(() => {
        if (process.send) {
            log(`Returning file ${msg.inFile}.`);
            process.send(msg.inFile);
        }
    });
});
process.on('beforeExit', () => log('Terminating.'));
log('Started.');