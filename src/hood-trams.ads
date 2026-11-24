--  Item 6: the street trams, drawn only (1.2.91 trams.ts without stops or
--  riders). One line down the middle of each avenue, edge to edge; eight
--  trams a line, four each way, on a timetable that runs on from week to
--  week. They stop for nobody and block nobody (DESIGN 6.5). Written fresh.
with Interfaces;
with Hood.City;

package Hood.Trams with Preelaborate is

   use Interfaces;

   Per_Line  : constant := 8;
   Max_Lines : constant := 8;
   Max_Trams : constant := Per_Line * Max_Lines;
   Track     : constant Long_Float := 1.55;  --  off the line's middle
   Length    : constant Long_Float := 11.0;  --  a tram, metres

   type Tram is record
      X, Y    : Long_Float;
      DX, DY  : Long_Float;  --  unit direction of travel
      Line    : Integer_32;
      Visible : Boolean;     --  the whole body is on the map
   end record;
   type Tram_List is array (Integer_32 range 0 .. Max_Trams - 1) of Tram;

   procedure At_Time
     (C : Hood.City.City_State; Week : Integer_32; Minute : Long_Float;
      List : out Tram_List; Count : out Integer_32);
   --  tramsAt: every tram at that minute of the week (rows' lines first).

end Hood.Trams;
