--  The integer-only interface between the Ada core and the browser host.
--  Every exported name starts with hs_ and is listed in build.sh.
with Interfaces;

package Hood.Host_ABI is

   use Interfaces;

   --  Error codes the host shows in the crash notice (all proposed).
   Error_Bounds           : constant := 1;  --  an index outside its table
   Error_Range            : constant := 2;  --  a value outside its range
   Error_Unexpected_State : constant := 3;  --  any other last-chance stop
   Error_Crash_Test       : constant := 4;  --  the Crash test button

   subtype Error_Code is Integer_32 range Error_Bounds .. Error_Crash_Test;

   --  Seed of the placeholder state hash (proposed).
   Hash_Seed : constant := 1932;

   --  Longest Ada file name kept for the crash notice.
   Max_File : constant := 64;

   function Build_Id return Integer_32
     with Export, Convention => C, External_Name => "hs_build_id";
   --  The build time as YYDDDHHMM (Europe/Berlin), from Hood.Version.

   function State_Hash return Unsigned_32
     with Export, Convention => C, External_Name => "hs_state_hash";
   --  FNV-1a (32 bit) over the four little-endian bytes of Hash_Seed.
   --  A placeholder until the world exists (item 2).

   procedure Crash_Test (Code : Integer_32)
     with Export, Convention => C, External_Name => "hs_crash_test",
          No_Return;
   --  Stops on purpose. Codes outside Error_Code count as
   --  Error_Unexpected_State. In the browser the stop goes through the
   --  last-chance handler to the host's hs_host_error (code, line).

   function Error_File_Length return Integer_32
     with Export, Convention => C, External_Name => "hs_error_file_length";
   --  Length of the Ada file name of the last stop, 0 before any stop.

   function Error_File_Char (Index : Integer_32) return Integer_32
     with Export, Convention => C, External_Name => "hs_error_file_char";
   --  Character code at Index (1-based) of that file name, 0 outside it.

   function Pending_Code return Error_Code;
   --  The code the next last-chance stop reports.

   procedure Set_Error_File (Name : String)
     with Post => Error_File_Length = Integer_32 (Integer'Min (Name'Length, Max_File));
   --  Keeps up to Max_File characters of Name.

end Hood.Host_ABI;
