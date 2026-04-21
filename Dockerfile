# 使用 Node.js 官方镜像
FROM node:20-slim

WORKDIR /app

# 复制 package.json 和 lock 文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制所有源代码
COPY . .

# 执行 Vite 构建生成 dist 目录
RUN npm run build

# 暴露端口 (3000 是你在 package.json 中配置的端口)
EXPOSE 3000

# 启动服务器
CMD ["npm", "start"]
