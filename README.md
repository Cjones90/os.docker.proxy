
# Use  

Extendable proxy container  

### To Run

Dev & Production system require:  
**[<u>Docker</u>](https://docs.docker.com/engine/installation/)** (Engine & Compose) (v2+)  

Inside root project directory with `docker-compose.yml` run:  
`docker-compose up [-d]`   

Check `HOST` under `HOST:CONTAINER` in `docker-compose.yml` for port (default 80).  

### Development  
1) Edit `docker-compose.yml` to suit your needs   
2) Inside directory with `docker-compose.yml` run:  
`docker-compose up [-d]`  
3) To run webpack inside the container, in another tab/pane run:  
`docker exec CONTAINER_NAME npm run watch`

### Proxy
- If using SSL, needs a $REMOTE_KEYS_DIR variable to be run while using the SSL certs  
 - Reads in certs in the form of
 ```
 key: fs.readFileSync("creds/privkey.pem"),
 cert: fs.readFileSync("creds/fullchain.pem"),
 ca: fs.readFileSync("creds/chain.pem")
 ```
- Uses a host.json file for proxies in the form of `DNS_HOST_NAME: localmachine:HOST_PORT`  
 - Example
```
{
    "localhost": "localmachine:3333",
    "www.example.com": "localmachine:3001",
    "example.com": "localmachine:3001",
    "portfolio.example.com": "localmachine:3003"
}
```

# TODO
Create custom error page
