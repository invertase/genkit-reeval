ARG REEVAL_BASE
FROM ${REEVAL_BASE}

RUN npm i -g genkit-cli@1.44.1

COPY --from=golang:1.26.10-bookworm@sha256:23ce71337b726608afb1bc00986e630a05034a87a87ea1fc2cd1ae5cf33387eb /usr/local/go /usr/local/go
ENV GOROOT=/usr/local/go \
    GOPATH=/opt/go \
    GOCACHE=/opt/gocache \
    GOTOOLCHAIN=local \
    CGO_ENABLED=0
ENV PATH=/usr/local/go/bin:/opt/go/bin:${PATH}

# Warm the module and build caches with Genkit Go v1.14.0 and the packages the probes use; no go.mod or source stays in an attempt's workspace.
RUN mkdir /tmp/warm && cd /tmp/warm \
    && printf 'package main\n\nimport (\n\t_ "github.com/firebase/genkit/go/ai"\n\t_ "github.com/firebase/genkit/go/ai/exp"\n\t_ "github.com/firebase/genkit/go/ai/exp/localstore"\n\t_ "github.com/firebase/genkit/go/genkit"\n\t_ "github.com/firebase/genkit/go/genkit/exp"\n\t_ "github.com/firebase/genkit/go/plugins/googlegenai"\n)\n\nfunc main() {}\n' > main.go \
    && printf 'module warm\n\ngo 1.25.0\n\nrequire github.com/firebase/genkit/go v1.14.0\n' > go.mod \
    && go mod tidy && go build -o /dev/null . \
    && cd / && rm -rf /tmp/warm \
    && chmod -R a+rwX /opt/go /opt/gocache
