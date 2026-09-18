import type { AiModelRegistry } from "@/lib/ai/model-registry";

export function AiModelsPanel({ registry }: { registry: AiModelRegistry }) {
  return <section className="ai-models-panel panel" aria-labelledby="ai-models-heading">
    <h2 id="ai-models-heading">AI Models</h2>
    <div className="ai-model-providers">
      {(["gemini", "openai"] as const).map(provider => {
        const config = registry[provider];
        const defaultLabel = config.models.find(model => model.id === config.defaultModel)?.label ?? config.defaultModel;
        return <div key={provider}><h3>{provider === "gemini" ? "Gemini" : "OpenAI"}</h3>
          <p><strong>Default:</strong> {defaultLabel}</p>
          <p className="muted ai-models-label">Available:</p>
          <ul>{config.models.map(model => <li key={model.id}><span>{model.label}</span>
            {model.id === config.defaultModel && <small>Default</small>}</li>)}</ul>
        </div>;
      })}
    </div>
  </section>;
}
