with Hood.Floats;

package body Hood.Streets is

   use Hood.City;

   W1, H1, Count_Of : Integer_32 := 0;
   type Way_Table is array (Integer_32 range 0 .. Max_Nodes - 1) of Way_Set;
   Table  : Way_Table;
   Number : Way_Count_Set;
   Rows_Through : array (Integer_32 range 0 .. 40) of Boolean := [others => False];
   Cols_Through : array (Integer_32 range 0 .. 50) of Boolean := [others => False];

   --  The search's work arrays, kept between searches (a generation
   --  stamp marks what this search reached).
   Seen   : array (Integer_32 range 0 .. Max_Nodes - 1) of Integer_32 := [others => 0];
   Parent : array (Integer_32 range 0 .. Max_Nodes - 1) of Integer_32 := [others => 0];
   Queue  : array (Integer_32 range 0 .. Max_Nodes - 1) of Integer_32 := [others => 0];
   Stamp  : Integer_32 := 0;

   function Width return Integer_32 is (W1);
   function Node_Count return Integer_32 is (Count_Of);
   function Ways (N : Node_Id) return Integer_32 is (Number (N));
   function Way (N : Node_Id; K : Integer_32) return Node_Id is (Table (N) (Integer (K)));
   function Node_X (N : Node_Id) return Long_Float is (Long_Float (N mod W1) * Cell);
   function Node_Y (N : Node_Id) return Long_Float is (Long_Float (N / W1) * Cell);
   function Through_Rows (Y : Integer_32) return Boolean is (Rows_Through (Y));
   function Through_Cols (X : Integer_32) return Boolean is (Cols_Through (X));

   function Opens (A, B : Node_Id) return Boolean is
   begin
      for K in 0 .. Number (A) - 1 loop
         if Table (A) (Integer (K)) = B then
            return True;
         end if;
      end loop;
      return False;
   end Opens;

   function Block_At (C : City_State; GX, GY : Integer_32) return Integer_32 is
      B : Integer_32;
   begin
      if GX < 0 or else GY < 0 or else GX >= C.W or else GY >= C.H then
         return No_Id;
      end if;
      B := GY * C.W + GX;
      if B >= C.Block_Count then
         return No_Id;
      end if;
      return (if C.Blocks (B).Merged_Into /= No_Id then C.Blocks (B).Merged_Into else B);
   end Block_At;

   function Edge_Open (C : City_State; AX, AY, BX, BY : Integer_32) return Boolean is
      X, Y, A, B : Integer_32;
      WA, WB : Boolean;
   begin
      if abs (AX - BX) + abs (AY - BY) /= 1
        or else Integer_32'Min (Integer_32'Min (AX, BX), Integer_32'Min (AY, BY)) < 0
        or else Integer_32'Max (AX, BX) > C.W or else Integer_32'Max (AY, BY) > C.H
      then
         return False;
      end if;
      X := Integer_32'Min (AX, BX);
      Y := Integer_32'Min (AY, BY);
      A := Block_At (C, (if AX = BX then X - 1 else X), (if AY = BY then Y - 1 else Y));
      B := Block_At (C, X, Y);
      WA := A /= No_Id and then C.Blocks (A).Use_Of = Water;
      WB := B /= No_Id and then C.Blocks (B).Use_Of = Water;
      if (WA or WB) and then (WA or A = No_Id) and then (WB or B = No_Id) then
         return False;
      end if;
      return A = No_Id or else B = No_Id or else A /= B;
   end Edge_Open;

   procedure Build (C : City_State) is
      DX : constant array (0 .. 3) of Integer_32 := [1, 0, -1, 0];
      DY : constant array (0 .. 3) of Integer_32 := [0, 1, 0, -1];
      N : Integer_32;
      All_Open : Boolean;
   begin
      W1 := C.W + 1;
      H1 := C.H + 1;
      Count_Of := W1 * H1;
      for Y in 0 .. C.H loop
         for X in 0 .. C.W loop
            N := Y * W1 + X;
            Number (N) := 0;
            Table (N) := [others => -1];
            for K in 0 .. 3 loop
               if Edge_Open (C, X, Y, X + DX (K), Y + DY (K)) then
                  Table (N) (Integer (Number (N))) := (Y + DY (K)) * W1 + X + DX (K);
                  Number (N) := Number (N) + 1;
               end if;
            end loop;
         end loop;
      end loop;
      for Y in 0 .. C.H loop
         All_Open := True;
         for X in 0 .. C.W - 1 loop
            All_Open := All_Open and then Edge_Open (C, X, Y, X + 1, Y);
         end loop;
         Rows_Through (Y) := All_Open;
      end loop;
      for X in 0 .. C.W loop
         All_Open := True;
         for Y in 0 .. C.H - 1 loop
            All_Open := All_Open and then Edge_Open (C, X, Y, X, Y + 1);
         end loop;
         Cols_Through (X) := All_Open;
      end loop;
      Seen := [others => 0];
      Stamp := 0;
   end Build;

   function Nearest (PX, PY : Long_Float) return Integer_32 is
      X : constant Integer_32 :=
        Integer_32'Max (0, Integer_32'Min (W1 - 1, Hood.Floats.Round_Int (PX / Cell)));
      Y : constant Integer_32 :=
        Integer_32'Max (0, Integer_32'Min (H1 - 1, Hood.Floats.Round_Int (PY / Cell)));
      R : constant Integer_32 := Y * W1 + X;
      Best : Integer_32 := 0;
      Best_D : Long_Float := Hood.Floats.Infinity;
      D, NX, NY : Long_Float;
   begin
      if Number (R) > 0 then
         return R;
      end if;
      for I in 0 .. Count_Of - 1 loop
         if Number (I) > 0 then
            NX := PX - Node_X (I);
            NY := PY - Node_Y (I);
            D := NX * NX + NY * NY;
            if D < Best_D then
               Best := I;
               Best_D := D;
            end if;
         end if;
      end loop;
      return Best;
   end Nearest;

   procedure Route
     (FX, FY, TX, TY : Long_Float; Zig : Boolean;
      Nodes : out Node_List; Count : out Integer_32)
   is
      Start  : constant Integer_32 := Nearest (FX, FY);
      Finish : constant Integer_32 := Nearest (TX, TY);
      Head, Tail, At_N, Next, L : Integer_32;
   begin
      Nodes := [others => -1];
      Count := 0;
      Stamp := Stamp + 1;
      Head := 0;
      Tail := 1;
      Queue (0) := Start;
      Seen (Start) := Stamp;
      Parent (Start) := Start;
      while Head < Tail and then Seen (Finish) /= Stamp loop
         At_N := Queue (Head);
         Head := Head + 1;
         L := Number (At_N);
         for I in 0 .. L - 1 loop
            Next := Table (At_N) (Integer (if Zig then L - 1 - I else I));
            if Seen (Next) /= Stamp then
               Seen (Next) := Stamp;
               Parent (Next) := At_N;
               Queue (Tail) := Next;
               Tail := Tail + 1;
            end if;
         end loop;
      end loop;
      if Seen (Finish) /= Stamp then
         return;
      end if;
      --  Count the way back, then write it forwards.
      L := 1;
      At_N := Finish;
      while At_N /= Start loop
         At_N := Parent (At_N);
         L := L + 1;
      end loop;
      if L > Max_Route then
         return;  --  longer than the cap: reported as no route (proposed)
      end if;
      Count := L;
      At_N := Finish;
      for K in reverse 1 .. L loop
         Nodes (Integer (K)) := At_N;
         if At_N /= Start then
            At_N := Parent (At_N);
         end if;
      end loop;
   end Route;

end Hood.Streets;
