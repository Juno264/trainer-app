"use client";

export type AppTab = "home" | "train" | "history" | "manage";

type Props = {
  activeTab: AppTab;
  onSelect: (tab: AppTab) => void;
};

const TABS: { id: AppTab; label: string; icon: string }[] = [
  { id: "home",    label: "ホーム",       icon: "🏠" },
  { id: "train",   label: "トレーニング", icon: "🏋️" },
  { id: "history", label: "記録",         icon: "📊" },
  { id: "manage",  label: "管理",         icon: "⚙️" },
];

export default function BottomTabBar({ activeTab, onSelect }: Props) {
  return (
    <div className="flex-shrink-0 bg-zinc-950 border-t border-zinc-800 pb-safe-bottom">
      <div className="flex">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
              activeTab === tab.id ? "text-blue-400" : "text-zinc-500 active:text-zinc-300"
            }`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
