# eval/Makefile
include eval.env
export

BENCH ?= swe-bench-cl
ARM ?= cold
MAINT ?= none
PILOT ?= 0
RESUME ?= false
RUN_ID ?= $(shell date +%Y%m%dT%H%M%S)

# Valid (ARM, MAINT) combinations
VALID_cold   := none
VALID_native := none
VALID_memex  := none per-session daily
VALID_both   := none daily

.PHONY: validate build setup eval eval-all score compare clean network

validate:
	@if [ -z "$(VALID_$(ARM))" ]; then \
		echo "ERROR: Unknown ARM=$(ARM). Valid: cold native memex both"; exit 1; \
	fi
	@if ! echo "$(VALID_$(ARM))" | grep -qw "$(MAINT)"; then \
		echo "ERROR: Invalid MAINT=$(MAINT) for ARM=$(ARM). Valid: $(VALID_$(ARM))"; exit 1; \
	fi

build:
	cd .. && docker build -t $(IMAGE_NAME) -f eval/Dockerfile .

network:
	docker network inspect eval-net >/dev/null 2>&1 || \
		docker network create --driver bridge eval-net

setup:
	adapters/$(BENCH)/setup.sh

eval: validate build network
	@echo "=== Eval: BENCH=$(BENCH) ARM=$(ARM) MAINT=$(MAINT) PILOT=$(PILOT) RUN_ID=$(RUN_ID) ==="
	mkdir -p /tmp/memex-eval/$(RUN_ID)/{claude-home,snapshots,raw}
	cd /tmp/memex-eval/$(RUN_ID)/snapshots && git init && \
		git config user.email "eval@memex" && git config user.name "memex-eval"
	cp configs/memex-$(ARM).json /tmp/memex-eval/$(RUN_ID)/claude-home/memex.json
	cp configs/settings-$(ARM).json /tmp/memex-eval/$(RUN_ID)/claude-home/settings.json
	mkdir -p /tmp/memex-eval/$(RUN_ID)/claude-home/{skills,rules,cache/sessions,projects}
	docker run --rm \
		--network=eval-net \
		-e ANTHROPIC_API_KEY \
		-e ARM=$(ARM) -e MAINT=$(MAINT) -e PILOT=$(PILOT) -e RESUME=$(RESUME) \
		-e MODEL=$(MODEL) -e TASK_TIMEOUT=$(TASK_TIMEOUT) \
		-e MAINT_TIMEOUT=$(MAINT_TIMEOUT) -e DAILY_BATCH_SIZE=$(DAILY_BATCH_SIZE) \
		-v /tmp/memex-eval/$(RUN_ID)/claude-home:/home/eval/.claude \
		-v /tmp/memex-eval/$(RUN_ID)/snapshots:/eval/snapshots \
		-v /tmp/memex-eval/$(RUN_ID)/raw:/eval/raw \
		-v $(CURDIR)/data:/eval/data:ro \
		-v $(CURDIR)/data/swe-bench-cl/workdir:/eval/workdir \
		$(IMAGE_NAME) /eval/adapters/$(BENCH)/populate.sh
	docker run --rm \
		--network=eval-net \
		-e ANTHROPIC_API_KEY \
		-e ARM=$(ARM) -e MAINT=$(MAINT) -e PILOT=$(PILOT) -e RESUME=$(RESUME) \
		-e MODEL=$(MODEL) -e TASK_TIMEOUT=$(TASK_TIMEOUT) \
		-v /tmp/memex-eval/$(RUN_ID)/claude-home:/home/eval/.claude \
		-v /tmp/memex-eval/$(RUN_ID)/snapshots:/eval/snapshots \
		-v /tmp/memex-eval/$(RUN_ID)/raw:/eval/raw \
		-v $(CURDIR)/data:/eval/data:ro \
		-v $(CURDIR)/data/swe-bench-cl/workdir:/eval/workdir \
		$(IMAGE_NAME) /eval/adapters/$(BENCH)/run.sh
	scripts/collect-results.sh $(BENCH) $(ARM) $(MAINT) $(RUN_ID)

score:
	ARM=$(ARM) MAINT=$(MAINT) adapters/$(BENCH)/score.sh results/$(BENCH)/$(ARM)-$(MAINT)/$(RUN_ID)

compare:
	scripts/compare.sh "$(A)" "$(B)"

eval-all: build network
	$(MAKE) eval ARM=cold    MAINT=none        & \
	$(MAKE) eval ARM=native  MAINT=none        & \
	$(MAKE) eval ARM=memex   MAINT=none        & \
	$(MAKE) eval ARM=memex   MAINT=per-session & \
	$(MAKE) eval ARM=memex   MAINT=daily       & \
	$(MAKE) eval ARM=both    MAINT=none        & \
	$(MAKE) eval ARM=both    MAINT=daily       & \
	wait

clean:
	rm -rf /tmp/memex-eval/*
