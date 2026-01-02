import { FamilyTreeProvider, useFamilyTree } from './context/FamilyTreeContext'
import { FamilyTreeView } from './components/FamilyTreeView'
import { TreeManager } from './components/TreeManager'
import { FamilyTableView } from './components/FamilyTableView'
import './App.css'

function AppContent() {
  const { currentView, allTrees, activeTreeId, createTree, selectTree, renameTree, deleteTree, exportTree, importTree, openTableView } = useFamilyTree();

  if (currentView === 'manager') {
    return (
      <TreeManager
        trees={allTrees}
        activeTreeId={activeTreeId}
        onCreateTree={createTree}
        onSelectTree={selectTree}
        onRenameTree={renameTree}
        onDeleteTree={deleteTree}
        onExportTree={exportTree}
        onImportTree={importTree}
        onOpenTable={openTableView}
      />
    );
  }

  if (currentView === 'table') {
    return <FamilyTableView />;
  }

  return <FamilyTreeView />;
}

function App() {
  return (
    <FamilyTreeProvider>
      <AppContent />
    </FamilyTreeProvider>
  )
}

export default App
