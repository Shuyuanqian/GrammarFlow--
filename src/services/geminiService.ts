/**
 * 语法解释评价服务 - 调用后端接口 (支持流式输出)
 */
export async function evaluateExplanation(
  userExplanation: string,
  questionData: any,
  passKeywords: string[],
  consecutiveFailures: number = 0,
  onChunk?: (text: string) => void
) {
  // 关键词匹配逻辑（用于 AI 失败兜底）
  const getKeywordResult = () => {
    const hasKeyword = passKeywords.some(kw => userExplanation.toLowerCase().includes(kw.toLowerCase()));
    const status = hasKeyword ? "pass" : "fail";
    const questionId = questionData.id || "未知";
    
    const comment = hasKeyword 
        ? `[STATUS]：CORRECT\n\n+ #${questionId} 🎖️ [逻辑达成]\n\n看，出题人想骗你，但被你一眼识破了。继续这种透视感。`
        : `[STATUS]：INCORRECT\n\n陷阱触发。你还没看清楚那个信号。`;
    
    if (onChunk) onChunk(comment);
    
    return {
      status,
      comment,
      reasoning: "Keyword matching fallback"
    };
  };

  try {
    const response = await fetch('/api/evaluate-explanation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userExplanation,
        questionData,
        passKeywords,
        consecutiveFailures
      }),
    });

    if (!response.ok) {
      let errorDetail = 'Unknown Server Error';
      try {
        const errorJson = await response.json();
        errorDetail = errorJson.error || JSON.stringify(errorJson);
      } catch (e) {
        errorDetail = response.statusText;
      }
      throw new Error(`Server Error: ${errorDetail} (Status: ${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get stream reader');
    }

    let fullText = "";
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunkText = decoder.decode(value);
      fullText += chunkText;
      if (onChunk) onChunk(fullText);
    }
    
    // Parse the full text to extract status and reasoning
    const statusMatch = fullText.match(/\[STATUS\]\s*[：:]\s*(PASS|FAIL|CORRECT|INCORRECT|Pass|Fail|Correct|Incorrect)/i);
    const reasoningMatch = fullText.match(/\[REASONING\]\s*[：:]\s*(.*?)\n/i);
    
    let status: "pass" | "fail" = "fail";
    if (statusMatch) {
      const s = statusMatch[1].toUpperCase();
      status = (s === "PASS" || s === "CORRECT") ? "pass" : "fail";
    }

    const reasoning = reasoningMatch ? reasoningMatch[1] : "Parsed from server stream";

    return {
      status,
      comment: fullText,
      reasoning
    };
  } catch (error) {
    console.error("AI Evaluation Error (Service):", error);
    return getKeywordResult();
  }
}

/**
 * 每日总结评价生成 (调用后端接口)
 */
export async function generateDailyReport(newStars: number, practicedPoints: number) {
  try {
    const response = await fetch('/api/generate-daily-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newStars, practicedPoints }),
    });

    if (!response.ok) {
      let errorDetail = 'Unknown Server Error';
      try {
        const errorJson = await response.json();
        errorDetail = errorJson.error || JSON.stringify(errorJson);
      } catch (e) {
        errorDetail = response.statusText;
      }
      throw new Error(`Server Error: ${errorDetail} (Status: ${response.status})`);
    }

    const data = await response.json();
    return data.text || `今天你点亮了 ${newStars} 颗星，消灭了 ${practicedPoints} 个语法死角，你的语法星系正在变得灿烂！`;
  } catch (error) {
    console.error("Report Generation Error (Service):", error);
    return `今天你点亮了 ${newStars} 颗星，消灭了 ${practicedPoints} 个语法死角，你的语法星系正在变得灿烂！`;
  }
}
