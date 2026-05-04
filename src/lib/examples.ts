export interface Example {
  id: string;
  label: string;
  hint: string;
  source: string;
}

export const examples: Example[] = [
  {
    id: 'k8s-deployment',
    label: 'Kubernetes Deployment (with issues)',
    hint: 'Deprecated API, latest tag, root user, no limits',
    source: `apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:latest
          ports:
            - containerPort: 80
          securityContext:
            privileged: true
`,
  },
  {
    id: 'k8s-clean',
    label: 'Kubernetes Deployment (clean)',
    hint: 'A more secure baseline',
    source: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27.2
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "256Mi"
          livenessProbe:
            httpGet: { path: /, port: 80 }
          readinessProbe:
            httpGet: { path: /, port: 80 }
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
`,
  },
  {
    id: 'compose-bad',
    label: 'docker-compose.yml (with issues)',
    hint: 'Latest tag, docker socket mount, no limits',
    source: `version: "3"
services:
  api:
    image: myapp
    ports:
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /etc:/host-etc:ro
    privileged: true
  db:
    image: postgres:latest
    network_mode: host
`,
  },
  {
    id: 'dockerfile-bad',
    label: 'Dockerfile (with issues)',
    hint: 'Latest tag, root user, shell-form CMD, apt cleanup',
    source: `FROM node
MAINTAINER ops@example.com

WORKDIR app

RUN apt-get update && apt-get install -y curl python3

ADD package.json /app/package.json
RUN npm install

COPY . /app

CMD npm start
`,
  },
  {
    id: 'dockerfile-good',
    label: 'Dockerfile (clean)',
    hint: 'Pinned base, non-root user, exec form, healthcheck',
    source: `FROM node:20.18-alpine

LABEL org.opencontainers.image.source="https://github.com/example/app"

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

USER node

HEALTHCHECK --interval=30s --timeout=3s \\
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
`,
  },
  {
    id: 'package-json-bad',
    label: 'package.json (with issues)',
    hint: 'Bad name, non-semver version, no license',
    source: `{"name":"My App","version":"1.0","dependancies":{"react":"^18.0.0"},"scripts":{"start":"node ."}}
`,
  },
  {
    id: 'package-json-good',
    label: 'package.json (clean)',
    hint: 'Valid name, semver, license',
    source: `{
  "name": "@example/app",
  "version": "1.4.2",
  "description": "Example application",
  "license": "MIT",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc"
  },
  "dependencies": {
    "react": "^18.3.1"
  }
}
`,
  },
  {
    id: 'tsconfig-bad',
    label: 'tsconfig.json (deprecated options)',
    hint: 'Old target, deprecated suppress flags',
    source: `{
  // tsconfig allows comments (JSONC)
  "compilerOptions": {
    "target": "es5",
    "module": "commonjs",
    "strict": false,
    "noImplicitAny": true,
    "suppressImplicitAnyIndexErrors": true,
    "importsNotUsedAsValues": "preserve",
    "outDir": "./dist"
  },
  "include": ["src"],
}
`,
  },
  {
    id: 'compose-good',
    label: 'docker-compose.yml (clean)',
    hint: 'Pinned versions, limits, restart policy',
    source: `services:
  api:
    image: myapp:1.4.2
    restart: unless-stopped
    ports:
      - "8080:8080"
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "0.5"
  db:
    image: postgres:16.3
    restart: unless-stopped
    volumes:
      - dbdata:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 1G

volumes:
  dbdata:
`,
  },
];
