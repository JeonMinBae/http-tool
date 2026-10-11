import { Split } from "./common/Split";
import { RequestPane } from "./request/RequestPane";
import { Sidebar } from "./sidebar/Sidebar";
import { TabBar } from "./tabs/TabBar";
import { TopBar } from "./TopBar";

export function AppLayout() {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <Split
        id="main"
        orientation="horizontal"
        className="min-h-0 flex-1"
        panes={[
          { id: "sidebar", defaultSize: "22", minSize: 180, maxSize: "45", children: <Sidebar /> },
          {
            id: "content",
            minSize: "40",
            children: (
              <div className="flex h-full flex-col">
                <TabBar />
                <div className="min-h-0 flex-1">
                  <RequestPane />
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
