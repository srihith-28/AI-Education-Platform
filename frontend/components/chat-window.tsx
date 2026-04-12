"use client";

import { motion } from "framer-motion";


type Message = {
  role: "user" | "assistant";
  text: string;
};

type ChatWindowProps = {
  messages: Message[];
};

export function ChatWindow({ messages }: ChatWindowProps) {
  return (
    <div className="glass h-[420px] overflow-y-auto rounded-2xl p-4 shadow-glass">
      <div className="space-y-3">
        {messages.map((message, index) => (
          <motion.div
            key={`${message.role}-${index}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: index * 0.03 }}
            className={`max-w-[80%] rounded-2xl px-4 py-2 ${
              message.role === "user"
                ? "ml-auto bg-teal-500/20 text-slate-900 dark:text-slate-50"
                : "mr-auto border border-slate-200/80 bg-white/70 text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
            }`}
          >
            {message.text}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
