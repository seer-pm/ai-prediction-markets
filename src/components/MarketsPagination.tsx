import { ChevronLeft, ChevronRight } from "@/lib/icons";
import ReactPaginate from "react-paginate";

const cell =
  "h-9 min-w-9 px-1 flex items-center justify-center rounded-md border border-rule-strong bg-surface text-body text-ink-2 cursor-pointer shadow-raised transition-colors hover:bg-sunken";

function MarketsPagination({
  pageCount,
  handlePageClick,
  page,
}: {
  pageCount: number;
  handlePageClick: ({ selected }: { selected: number }) => void;
  page: number;
}) {
  return (
    <ReactPaginate
      breakLabel="…"
      nextLabel={<ChevronRight fill="currentColor" />}
      onPageChange={handlePageClick}
      forcePage={page - 1}
      pageCount={pageCount}
      previousLabel={<ChevronLeft fill="currentColor" />}
      renderOnZeroPageCount={null}
      className="flex items-center justify-center gap-1.5"
      activeClassName="!border-primary !bg-primary !text-white"
      pageClassName={cell}
      nextClassName={cell}
      previousClassName={cell}
      breakClassName="h-9 min-w-9 flex items-center justify-center text-body text-ink-4"
      disabledClassName="opacity-40 pointer-events-none"
      pageLinkClassName="w-full h-full flex items-center justify-center px-1"
      previousLinkClassName="w-full h-full flex items-center justify-center"
      nextLinkClassName="w-full h-full flex items-center justify-center"
      breakLinkClassName="w-full h-full flex items-center justify-center"
    />
  );
}

export default MarketsPagination;
