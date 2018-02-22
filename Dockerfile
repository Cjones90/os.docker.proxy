# TODO: Check which is the latest LTS that works/has been stable
FROM node

RUN apt-get update && apt-get install -y \
    vim \
    git

# TODO: Check which version has been stable
# Might not even need either of these for the scraper
RUN npm i node-gyp -g pm2 -g

WORKDIR /home/app

ADD package.json /home/app/package.json
RUN npm install

ADD src /home/app/src
#RUN npm run release

#ADD pub /home/app/pub
ADD server /home/app/server
ADD docker-compose.yml /home/app/docker-compose.yml
