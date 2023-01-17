const Promise = require('bluebird');
const {sleep} = require("telegram/Helpers");

module.exports = {
    directive: 'STOR',
    handler: function ({log, command} = {}) {
        if (!this.fs) return this.reply(550, 'File system not instantiated');
        if (!this.fs.write) return this.reply(402, 'Not supported by file system');

        const append = command.directive === 'APPE';
        const fileName = command.arg;

        return this.connector.waitForConnection()
            .tap(() => this.commandSocket.pause())
            .then(() => Promise.try(() => this.fs.write(fileName, {append, start: this.restByteCount})))
            .then((fsResponse) => {
                const serverPath = fileName;

                const socketPromise = new Promise(async (resolve, reject) => {
                    const file = await this.fs.file(fileName);

                    if (this.connector.socket === null) {
                        this.fs.saveBuffer(fileName, "", 0).then(() => {
                            return resolve();
                        });
                        return;
                    }

                    this.connector.socket.on("data", (chunk) => {
                        file.sendBuffer(chunk);
                    });

                    file.onFinished = () => {
                        console.log("onfinshed");
                        file.upload().then(res => {
                            this.fs.saveBuffer(fileName, res.id, res.media.document.size).then(() => {
                                console.log("save buffer success");
                                this.connector.end();
                               return resolve();
                            });
                        });
                    }

                    //this.connector.socket.once('error', destroyConnection(stream, reject));
                });

                this.restByteCount = 0;

                return this.reply(150).then(() => this.connector.socket && this.connector.socket.resume())
                    .then(() => Promise.all([socketPromise]))
                    .tap(() => this.emit('STOR', null, fileName))
                    .then(() => this.reply(226, fileName))
                    //.then(() => stream.destroy && stream.destroy());
            })
            .catch(Promise.TimeoutError, (err) => {
                log.error(err);
                return this.reply(425, 'No connection established');
            })
            .catch((err) => {
                log.error(err);
                this.emit('STOR', err);
                return this.reply(550, err.message);
            })
            .then(() => {
                this.connector.end();
                this.commandSocket.resume();
            });
    },
    syntax: '{{cmd}} <path>',
    description: 'Store data as a file at the server site'
};
