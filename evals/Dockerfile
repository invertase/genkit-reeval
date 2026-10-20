ARG REEVAL_BASE
FROM ${REEVAL_BASE}

RUN npm i -g genkit-cli@1.44.1

# The fixture's dependencies, from its lockfile, so an attempt copies them in instead of downloading 54 MB.
COPY app/package.json app/package-lock.json /opt/support-desk/
RUN cd /opt/support-desk && npm ci --no-audit --no-fund
