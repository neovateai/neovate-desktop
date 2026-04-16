import { EventPublisher } from "@orpc/server";

export class PreviewManager {
  #html = "";
  readonly publisher = new EventPublisher<{ update: string }>();

  setHtml(html: string) {
    this.#html = html;
    this.publisher.publish("update", html);
  }

  getHtml() {
    return this.#html;
  }
}
