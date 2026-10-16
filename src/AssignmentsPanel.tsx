import {useRef} from "react";
import {createPortal} from "react-dom";
import AssignmentReview from "./AssignmentReview";
import ExamPreview from "./ExamPreview";
import {IconPlus,IconRefresh} from "./icons";
import ActionMenu from "./ui/ActionMenu";
import AssignmentList,{MaxAttemptsDialog,AssignmentTimingDialog,AssignmentDetailsDialog,AssignmentActionMenu} from "./assignments/AssignmentList";
import AssignmentDetail from "./assignments/AssignmentDetail";
import AssignmentComposer from "./assignments/AssignmentComposer";
import Gradebook from "./assignments/Gradebook";
import {DeadlineDialog,ReopenDialog,ExtendDialog,PurgeDialog,BulkDeadlineDialog} from "./assignments/GradebookRowEditors";
import {studentsCount} from "./assignments/assignmentPage";
import {useAssignmentsController,type AssignmentsControllerProps} from "./assignments/useAssignmentsController";
import {rowGrading} from "./assignments/assignmentsView";
import {fmt} from "./assignments/assignmentsApi";
import AssignmentsHomeKpis from "./assignments/AssignmentsHomeKpis";
import AssignmentOverview from "./assignments/AssignmentOverview";
import {TIME_FILTERS} from "./assignments/assignmentsHome";
import {downloadCsv} from "./reports/csv";
import {gradebookCsvRows,exportFilename} from "./teacher/teacherExports";

// Phase 21G.1 — the assignments workspace VIEW. Every piece of state, every request and every rule lives in
// useAssignmentsController (and its composer hook / pure view helpers); this component only lays the areas out.
// Props: App's token, classes, the open exam, the copy-to-builder hand-off, and the Phase 12B drill target (applied ONCE
// against the panel's own authoritative data, then reported through onDrillConsumed).
type Props=AssignmentsControllerProps;

export default function AssignmentsPanel(props:Props){
 const toolbarRef=useRef<HTMLDivElement|null>(null),composerHeadingRef=useRef<HTMLHeadingElement>(null),detailHeadingRef=useRef<HTMLHeadingElement>(null);
 const c=useAssignmentsController(props,{toolbarRef,composerHeadingRef,detailHeadingRef});
 const {toolbar:t,list:l,composer:k,detail:d,gradebook:g,dialogs:x}=c;
 const showDetailArea=c.mode==="composer"||d.item!==null;
 // Phase 21G.3 — an open assignment is a FULL-WIDTH page: the list (kept mounted, so focus returns to its «فتح») and the KPI strip wait.
 const pageOpen=c.mode==="list"&&d.item!==null;

 return <section className="assignments-panel eb-assignments">
  {!t.showArchived&&!pageOpen&&<AssignmentsHomeKpis kpis={c.home.kpis}/>}
  <div className="eb-assign-toolbar" role="region" aria-label="أدوات الواجبات" ref={toolbarRef} tabIndex={-1}>
   <div className="eb-assign-filters">
    <label className="eb-field-inline">الصف<select value={t.effectiveFilter} onChange={e=>t.changeScope({filterClassId:e.target.value})}><option value="">كل الصفوف</option>{t.active.map(cl=><option value={cl.classId} key={cl.classId}>{cl.name}{cl.grade?" · "+cl.grade:""}</option>)}</select></label>
    <div className="eb-segmented" role="group" aria-label="عرض الواجبات">
     <button type="button" aria-pressed={!t.showArchived} onClick={()=>t.changeScope({showArchived:false})}>الواجبات الحالية</button>
     <button type="button" aria-pressed={t.showArchived} onClick={()=>t.changeScope({showArchived:true})}>المؤرشفة{t.archivedCount?" ("+t.archivedCount+")":""}</button>
    </div>
    <label className="eb-field-inline eb-assign-search">بحث<input type="search" value={t.search} onChange={e=>t.changeScope({search:e.target.value})} placeholder="بحث بعنوان الواجب أو الصف"/></label>
    {!t.showArchived&&<div className="eb-chip-group eb-assign-time-filters" role="group" aria-label="تصفية حسب الوقت">
     {TIME_FILTERS.filter(f=>f.key==="all"||t.timeCounts[f.key]>0||t.timeFilter===f.key).map(f=><button key={f.key} type="button" className="eb-filter-chip" aria-pressed={t.timeFilter===f.key} onClick={()=>t.changeScope({timeFilter:f.key})}>{f.label} <span className="eb-filter-chip-n">{t.timeCounts[f.key]}</span></button>)}
    </div>}
   </div>
   <div className="eb-assign-actions">
    <button type="button" className="eb-button is-primary" onClick={t.openComposer} disabled={c.mode==="composer"}><IconPlus size={16}/>إنشاء واجب</button>
    <ActionMenu label="المزيد من إجراءات الواجبات">
     <button type="button" className="eb-menu-item" onClick={t.refresh} disabled={c.loading||k.source.examLoading}><IconRefresh size={16}/>تحديث</button>
    </ActionMenu>
   </div>
  </div>
  {c.error&&<div className="platform-error assignment-inline-message" role="alert">{c.error}</div>}{c.notice&&<div className="platform-notice assignment-inline-message" role="status" aria-live="polite">{c.notice}</div>}

  <div className={"eb-assign-layout"+(pageOpen?" is-page":showDetailArea?" has-detail":"")}>
   <AssignmentList hidden={pageOpen} items={l.visible} showArchived={t.showArchived} hasAnyInScope={l.hasAnyInScope} selectedId={l.selectedId} busy={c.busy} loading={c.loading}
    onOpen={l.open} onPublish={l.publish} onUnpublish={l.unpublish}
    onEditAttempts={l.editAttempts} onEditTiming={l.editTiming} onEditDetails={l.editDetails} onArchive={l.archive} onRestore={l.restore} onPurge={l.purge} onCreate={t.openComposer} fmt={fmt} progress={c.home.progress} now={c.home.now}/>
   {c.mode==="composer"&&<AssignmentComposer headingRef={composerHeadingRef} onClose={k.close} busy={c.busy} examLoading={k.source.examLoading}
    sourceMode={k.source.sourceMode} onSourceMode={m=>void k.source.switchSourceMode(m)} sourceExam={k.source.sourceExam} sourceCount={k.source.sourceCount} currentExam={k.source.current} hasCurrent={k.source.hasCurrent}
    savedExams={k.source.savedExams} examSource={k.source.examSource} onChooseExam={v=>void k.source.chooseExam(v)}
    libraryLoading={k.library.libraryLoading} libraryItems={k.library.libraryFiltered} libraryCategories={k.library.libraryCats} librarySearch={k.library.librarySearch} onLibrarySearch={k.library.setLibrarySearch} libraryCategory={k.library.libraryCategory} onLibraryCategory={k.library.setLibraryCategory}
    librarySelectedId={k.library.librarySelectedId} onChooseLibraryItem={it=>void k.library.chooseLibraryItem(it)} onPreview={it=>void k.library.openPreview(it)} previewBusyId={k.library.previewBusyId} onCopyToBuilder={k.library.copyLibraryItem?(it=>void k.library.copyLibraryItem?.(it)):undefined} copyBusyId={k.library.copyBusyId}
    activeClasses={t.active} classIds={k.fields.classIds} onToggleClass={k.fields.toggleClass} onAllClasses={k.fields.setAllClasses} onPreviewContent={k.previewSelected} title={k.fields.title} onTitle={k.fields.setTitle} instructions={k.fields.instructions} onInstructions={k.fields.setInstructions} openAt={k.fields.openAt} onOpenAt={k.fields.setOpenAt} dueAt={k.fields.dueAt} onDueAt={k.fields.setDueAt}
    maxAttempts={k.fields.maxAttempts} onMaxAttempts={k.fields.setMaxAttempts} durationMinutes={k.fields.durationMinutes} onDurationMinutes={k.fields.setDurationMinutes} attemptPolicy={k.fields.attemptPolicy} onAttemptPolicy={k.fields.setAttemptPolicy} resultsRelease={k.fields.resultsRelease} onResultsRelease={k.fields.setResultsRelease} publish={k.fields.publish} onPublish={k.fields.setPublish} windowIssues={k.windowIssues} canCreate={k.canCreate} onCreate={k.create}/>}
   {c.mode==="list"&&d.item&&<AssignmentDetail item={d.item} stats={d.stats} loading={c.busy} headingRef={detailHeadingRef} onClose={d.close}
    analysis={d.analysis} analysisBusy={d.analysisBusy} analysisSort={d.analysisSort} onAnalysisSort={d.setAnalysisSort} tab={d.tab} onTab={d.selectTab} actions={<AssignmentActionMenu item={d.item} actions={{busy:c.busy,onPublish:l.publish,onUnpublish:l.unpublish,onEditAttempts:l.editAttempts,onEditTiming:l.editTiming,onEditDetails:l.editDetails,onArchive:l.archive,onRestore:l.restore,onPurge:l.purge}}/>} overview={<AssignmentOverview item={d.item} results={g.results} fmt={fmt} onEditDetails={l.editDetails} onEditTiming={l.editTiming} onEditAttempts={l.editAttempts} now={c.home.now} onResultsRelease={l.setResultsRelease} onReleaseResults={l.releaseResults} busy={c.busy}/>} sortedQuestions={d.sortedQuestions} analysisSummary={d.analysisSummary} fmt={fmt}>
    <Gradebook assignment={d.item} rows={g.rows} totalRows={g.results.length} gradingOf={rowGrading} busy={c.busy} focusStudentId={g.focusStudentId}
     search={g.search} onSearch={g.setSearch} filter={g.filter} onFilter={g.setFilter} sort={g.sort} onSort={g.setSort}
     onReview={g.review} onGrant={g.grant} onReopen={g.reopen} onExtend={g.extend} onDeadline={g.deadline} onEndAttempt={g.endAttempt} fmt={fmt}
     codingSummary={g.codingSummary} codingTotals={g.codingTotals} onBulkCodingRetry={g.bulkCodingRetry}
     selection={{selected:g.selected,onToggle:g.toggleSelected,onToggleAll:g.toggleAllSelected,onClear:g.clearSelection,onBulkGrant:g.bulkGrant,onBulkDeadline:g.openBulkDeadline}}
     onExportCsv={()=>{if(d.item)downloadCsv(exportFilename("TadrisPlus-سجل-العلامات",d.item.title),gradebookCsvRows(d.item,g.results,rowGrading))}}/>
   </AssignmentDetail>}
  </div>

  <MaxAttemptsDialog item={x.attemptsFor} busy={c.busy} onSave={x.saveMaxAttempts} onClose={x.closeAttempts}/>
  <AssignmentDetailsDialog item={x.detailsFor} busy={c.busy} onSave={x.saveDetails} onClose={x.closeDetails}/>
  <AssignmentTimingDialog item={x.timingFor} busy={c.busy} onSave={x.saveTiming} onClose={x.closeTiming} fmt={fmt}/>
  <BulkDeadlineDialog open={g.bulkDeadline.open} count={studentsCount(g.bulkDeadline.count)} assignment={d.item} busy={c.busy} value={g.bulkDeadline.value} onValue={g.bulkDeadline.setValue} onClose={g.bulkDeadline.close} onSave={g.bulkDeadline.save} fmt={fmt}/>
  <DeadlineDialog student={x.deadlineStudent} assignment={d.item} busy={c.busy} value={x.deadlineValue} onValue={x.setDeadlineValue} onClose={x.closeDeadline} onSave={x.saveDeadline} onClear={x.clearDeadline} fmt={fmt}/>
  <ReopenDialog student={x.reopenStudent} assignment={d.item} busy={c.busy} value={x.reopenValue} onValue={x.setReopenValue} onClose={x.closeReopen} onSave={x.saveReopen} fmt={fmt}/>
  <ExtendDialog student={x.extendStudent} assignment={d.item} busy={c.busy} value={x.extendValue} onValue={x.setExtendValue} onClose={x.closeExtend} onSave={x.saveExtend} willClip={x.willClip} fmt={fmt}/>
  <PurgeDialog item={x.purgeFor} title={x.purgeTitle} onTitle={x.setPurgeTitle} busy={c.busy} onConfirm={x.confirmPurge} onClose={x.closePurge}/>
  {x.confirmDialog}
  {c.review.target&&d.item&&<AssignmentReview token={c.token} assignmentId={d.item.assignmentId} studentId={c.review.target.studentId} initialAttempt={c.review.target.attemptNumber} onClose={c.review.close} onSaved={d.reload} nav={c.review.nav} onGo={c.review.go}/>}
  {k.preview&&createPortal(<ExamPreview exam={k.preview.exam} onClose={k.closePreview}/>,document.body)}
 </section>;
}
