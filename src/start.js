const servers=[require('./user').start(),require('./order').start(),require('./gateway').start()];
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const server of servers)server.close();});
