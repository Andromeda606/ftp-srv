const Promise = require('bluebird');

module.exports = {
    directive: 'RETR',
    handler: function ({log, command} = {}) {
        if (!this.fs) return this.reply(550, 'File system not instantiated');
        if (!this.fs.read) return this.reply(402, 'Not supported by file system');

        const filePath = command.arg;

        return this.connector.waitForConnection()
            .tap(() => this.commandSocket.pause())
            .then(() => Promise.try(() => this.fs.getCode(filePath)))
            .then((iter) => {
                const serverPath = filePath;
                const readData = new Promise(async (resolve,reject)=>{
                    for await (const chunk of iter) {
                        if(this.connector.socket === null){
                            console.log("socket returned null");
                            return resolve();
                        }
                        this.connector.socket.write(chunk);
                    }
                    return resolve();
                })
                this.restByteCount = 0;

                return this.reply(150).then(() => this.connector.socket.resume())
                    .then(() => Promise.all([readData]))
                    .tap(() => this.emit('RETR', null, serverPath))
                    .then(() => this.reply(226, filePath))
            })
            .catch(Promise.TimeoutError, (err) => {
                log.error(err);
                return this.reply(425, 'No connection established');
            })
            .catch((err) => {
                log.error(err);
                this.emit('RETR', err);
                return this.reply(551, err.message);
            })
            .then(() => {
                this.connector.end();
                this.commandSocket.resume();
            });
    },
    syntax: '{{cmd}} <path>',
    description: 'Retrieve a copy of the file'
};
