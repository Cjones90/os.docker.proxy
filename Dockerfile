FROM jestrr/mods:0.1

WORKDIR /home/app
ADD . /home/app

RUN npm install

RUN npm run release
