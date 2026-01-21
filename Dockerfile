FROM node:18-alpine

WORKDIR /app

# Instalar dependências do sistema para node-serialize e outras libs
RUN apk add --no-cache python3 make g++ iputils

# Copiar package.json primeiro para cache de layers
COPY package*.json ./

RUN npm install

# Copiar código fonte
COPY . .

# Criar diretório de uploads
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

EXPOSE 3000

CMD ["node", "server.js"]
