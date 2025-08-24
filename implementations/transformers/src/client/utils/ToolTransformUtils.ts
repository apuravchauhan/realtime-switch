/**
 * Utility functions for transforming tool definitions between OAI and Gemini formats
 */

export interface OAITool {
  type: "function";
  name: string;
  description: string;
  parameters: any;
  strict?: boolean;
}

export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: any;
}

/**
 * Recursively converts all "type" properties from lowercase to uppercase
 */
export function convertTypesToUppercase(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertTypesToUppercase(item));
  }

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'type' && typeof value === 'string') {
      // Convert lowercase type to uppercase
      result[key] = value.toUpperCase();
    } else if (typeof value === 'object') {
      result[key] = convertTypesToUppercase(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Recursively converts all "type" properties from uppercase to lowercase
 */
export function convertTypesToLowercase(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertTypesToLowercase(item));
  }

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'type' && typeof value === 'string') {
      // Convert uppercase type to lowercase
      result[key] = value.toLowerCase();
    } else if (typeof value === 'object') {
      result[key] = convertTypesToLowercase(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Transform OAI tools array to Gemini tools array
 */
export function transformOAIToolsToGemini(oaiTools: OAITool[]): GeminiTool[] {
  if (!oaiTools || oaiTools.length === 0) {
    return [];
  }

  return [{
    functionDeclarations: oaiTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: convertTypesToUppercase(tool.parameters)
    }))
  }];
}

/**
 * Transform Gemini tools array to OAI tools array
 */
export function transformGeminiToolsToOAI(geminiTools: GeminiTool[]): OAITool[] {
  if (!geminiTools || geminiTools.length === 0) {
    return [];
  }

  const allFunctions: OAITool[] = [];
  
  for (const toolGroup of geminiTools) {
    if (toolGroup.functionDeclarations) {
      for (const func of toolGroup.functionDeclarations) {
        allFunctions.push({
          type: "function",
          name: func.name,
          description: func.description,
          parameters: convertTypesToLowercase(func.parameters)
        });
      }
    }
  }

  return allFunctions;
}