export const appConfig = {
  defaultSymbol: process.env.DEFAULT_SYMBOL || "USDCNH",
  dataImportDefaultPath:
    process.env.DATA_IMPORT_DEFAULT_PATH || "./USDCNH-BBG-20Days.xlsx",
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || "",
  aiModelName: process.env.AI_MODEL_NAME || "rule-engine-v1"
}
