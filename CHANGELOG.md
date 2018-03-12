# Changelog

## 0.8.0 -> 0.9.0  
* Add healthcheck, entrypoint, label, cmd to docker image  
* Add consul TTL health check as a dead mans switch (docker was leaving zombie containers when scaling the stack up/down or connection handling)  
* Register/Deregister unique service checks per docker container on clean bootup/shutdown  
* Implement serverState for status of server and/or db connection for healthchecks  
* Use consul to get ssl/apps/routes for blue/green beta/prod deployments  
* Add `LISTEN_ON_SSL` and `SSL_TERMINATION`  
* Have https -> http or https -> https be configurable  

### Breaking changes  
* Remove host mounted volumes for production  
* Remove extra_hosts  
* Remove `PROXY_TO_SSL` and `SSL_PROXY_ON`  
* Uses SSL from consul instead of reading in ssl certs from files  
* Gets hosts from consul instead of reading it in from a host-mounted file  

### Bug Fixes  
* Use pm2-dev in development for server restarts  
* Wait to send pm2 "ready" until server is listening (for pm2-runtime)  
* Graceful shutdown to wait for both http and https server  

##### To be removed  
* Add proxy docker network (temp until setting up haproxy or nginx mainly)  
