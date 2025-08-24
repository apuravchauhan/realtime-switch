#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Pipeline Tests Suite${NC}"
echo "=============================="
echo ""

# Change to orchestrator directory
cd /Users/apuravchauhan/Pers-Drive/AI-Explorations-Project/orchestrator

# Run each test
echo -e "${YELLOW}Test 1: OpenAI API Style + OpenAI Provider${NC}"
npx ts-node test/pipeline-tests/PipelineTestOAIOAI.ts
echo ""

echo -e "${YELLOW}Test 2: OpenAI API Style + Gemini Provider (Cross-Provider)${NC}"
npx ts-node test/pipeline-tests/PipelineTestOAIGemini.ts
echo ""

echo -e "${YELLOW}Test 3: Gemini API Style + OpenAI Provider (Reverse Cross-Provider)${NC}"
npx ts-node test/pipeline-tests/PipelineTestGeminiOAI.ts
echo ""

echo -e "${YELLOW}Test 4: Gemini API Style + Gemini Provider (Native)${NC}"
npx ts-node test/pipeline-tests/PipelineTestGeminiGemini.ts
echo ""

echo -e "${GREEN}All tests completed!${NC}"
echo ""
echo "Log files created in: orchestrator/test/"
ls -la test/pipeline-test-*.log 2>/dev/null | tail -4