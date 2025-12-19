import { ChevronLeft, ChevronRight } from "@/lib/icons";
import ReactPaginate from "react-paginate";

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
      breakLabel="..."
      nextLabel={<ChevronRight fill="currentColor" />}
      onPageChange={handlePageClick}
      forcePage={page - 1}
      pageCount={pageCount}
      previousLabel={<ChevronLeft fill="currentColor" />}
      renderOnZeroPageCount={null}
      className="flex gap-2 items-center justify-center"
      activeClassName="!border-[#9747FF] text-[#9747FF]"
      pageClassName="w-[32px] h-[32px] border border-solid border-[#e5e5e5] flex items-center justify-center rounded-[3px] cursor-pointer"
      nextClassName="w-[32px] h-[32px] border border-solid border-[#e5e5e5] flex items-center justify-center rounded-[3px] cursor-pointer"
      previousClassName="w-[32px] h-[32px] border border-solid border-[#e5e5e5] flex items-center justify-center rounded-[3px]"
      disabledLinkClassName="text-[#e5e5e5]"
      pageLinkClassName="w-full h-full flex items-center justify-center"
      previousLinkClassName="w-full h-full flex items-center justify-center"
      nextLinkClassName="w-full h-full flex items-center justify-center"
      breakLinkClassName="w-full h-full flex items-center justify-center"
    />
  );
}

export default MarketsPagination;
